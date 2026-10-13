import { encodeAbiParameters, keccak256, parseAbi, parseAbiParameters, parseUnits, zeroAddress, type Address } from 'viem';
import { contract, type Client, type PoolKey, type Runtime } from './config';
// Protocol interfaces only; addresses are always read from imd-deployment.json.
export const poolType = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
export const quoterAbi = parseAbi([`function quoteExactInputSingle((${poolType} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`]);
export const routerAbi = parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable', 'error ExecutionFailed(uint256 commandIndex,bytes message)', 'error TransactionDeadlinePassed()']);
export const permitAbi = parseAbi(['function allowance(address user,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)', 'function approve(address token,address spender,uint160 amount,uint48 expiration)']);
export const erc20Abi = parseAbi(['function decimals() view returns (uint8)', 'function symbol() view returns (string)', 'function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)']);
export const stateAbi = parseAbi(['function getLiquidity(bytes32 poolId) view returns (uint128)', 'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)']);
export function currencyAbi(r: Runtime, address: Address) {
  const entry = r.deployment.contracts.find(c => c.address.toLowerCase() === address.toLowerCase());
  return entry ? r.abis[entry.name] : erc20Abi;
}
export type Currency = { address: Address; symbol: string; decimals: number };
export type Market = { token: Currency; pair: Currency; liquidity: bigint; sqrtPriceX96: bigint };
export function poolId(key: PoolKey) { return keccak256(encodeAbiParameters(parseAbiParameters(poolType), [key])); }
export async function readMarket(r: Runtime, client: Client): Promise<Market> {
  const key = r.deployment.poolKey, network = r.deployment.network, u = network.uniswapV4;
  if (!key || !u) throw new Error('Trading is unavailable: a vetted pool configuration is missing.');
  const token = contract(r, 'LaunchToken');
  if (![key.currency0.toLowerCase(), key.currency1.toLowerCase()].includes(token.address.toLowerCase())) throw new Error('The pool does not contain the attested launch token.');
  if (BigInt(key.currency0) >= BigInt(key.currency1)) throw new Error('Pool currency order is invalid.');
  await Promise.all([...new Set([u.quoter, u.universalRouter, u.permit2, u.stateView, u.poolManager, key.hooks].filter(x => x !== zeroAddress))].map(async address => {
    const code = await client.getCode({ address });
    if (!code || code === '0x') throw new Error('A configured trading contract has no code. Trading is disabled.');
  }));
  const pairAddress = key.currency0.toLowerCase() === token.address.toLowerCase() ? key.currency1 : key.currency0;
  const readCurrency = async (address: Address): Promise<Currency> => address === zeroAddress ? { address, symbol: network.nativeCurrency.symbol, decimals: network.nativeCurrency.decimals } : {
    address, symbol: await client.readContract({ address, abi: currencyAbi(r, address), functionName: 'symbol' }) as string, decimals: await client.readContract({ address, abi: currencyAbi(r, address), functionName: 'decimals' }) as number,
  };
  const [tokenInfo, pair, liquidity, slot0] = await Promise.all([
    readCurrency(token.address), readCurrency(pairAddress),
    client.readContract({ address: u.stateView, abi: stateAbi, functionName: 'getLiquidity', args: [poolId(key)] }),
    client.readContract({ address: u.stateView, abi: stateAbi, functionName: 'getSlot0', args: [poolId(key)] }),
  ]);
  return { token: tokenInfo, pair, liquidity, sqrtPriceX96: slot0[0] };
}
export function amountUnits(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value.trim()) || (value.split('.')[1]?.length ?? 0) > decimals) throw new Error(`Enter a positive amount with no more than ${decimals} decimal places.`);
  const amount = parseUnits(value.trim(), decimals);
  if (amount <= 0n || amount >= 2n ** 128n) throw new Error('Enter a positive amount within the swap limit.');
  return amount;
}
export function encodeSwap(key: PoolKey, input: Address, amountIn: bigint, minimum: bigint, extended = false) {
  const zeroForOne = input.toLowerCase() === key.currency0.toLowerCase();
  const output = zeroForOne ? key.currency1 : key.currency0;
  const tuple = extended
    ? encodeAbiParameters(parseAbiParameters(`(${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`), [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minimum, minHopPriceX36: 0n, hookData: '0x' }])
    : encodeAbiParameters(parseAbiParameters(`(${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`), [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minimum, hookData: '0x' }]);
  const params = [tuple, encodeAbiParameters(parseAbiParameters('address,uint256'), [input, amountIn]), encodeAbiParameters(parseAbiParameters('address,uint256'), [output, minimum])];
  return { commands: '0x10' as const, inputs: [encodeAbiParameters(parseAbiParameters('bytes,bytes[]'), ['0x060c0f', params])], value: input === zeroAddress ? amountIn : 0n };
}
export async function allowances(r: Runtime, client: Client, account: Address, input: Address, amount: bigint) {
  if (input === zeroAddress) return 'ready' as const;
  const u = r.deployment.network.uniswapV4!;
  const [token, permit, block] = await Promise.all([
    client.readContract({ address: input, abi: currencyAbi(r, input), functionName: 'allowance', args: [account, u.permit2] }),
    client.readContract({ address: u.permit2, abi: permitAbi, functionName: 'allowance', args: [account, input, u.universalRouter] }),
    client.getBlock(),
  ]);
  if ((token as bigint) < amount) return 'token' as const;
  if (permit[0] < amount || BigInt(permit[1]) <= block.timestamp + 120n) return 'permit' as const;
  return 'ready' as const;
}
