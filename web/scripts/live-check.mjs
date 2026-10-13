import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http, encodeAbiParameters, parseAbi, parseAbiParameters, keccak256 } from 'viem';
const d = JSON.parse(await readFile(new URL('../../dist/imd-deployment.json', import.meta.url), 'utf8'));
const result = { checkedAt: new Date().toISOString(), broadcastTransactions: false, chainId: d.chainId, rpc: [], contracts: [], collection: {}, pool: {} };
let usable;
for (const url of d.network.rpcUrls) {
  const client = createPublicClient({ transport: http(url, { retryCount: 0, timeout: 10_000 }) });
  try { const chainId = await client.getChainId(); result.rpc.push({ url, chainId, matched: chainId === d.chainId }); if (chainId === d.chainId && !usable) usable = client; }
  catch (e) { result.rpc.push({ url, error: e.shortMessage || e.message }); }
}
if (usable) {
  for (const c of d.contracts) {
    const code = await usable.getCode({ address: c.address });
    result.contracts.push({ name: c.name, address: c.address, codeBytes: code ? (code.length - 2) / 2 : 0 });
    if (c.name === 'SwarmCats') {
      const abi = JSON.parse(await readFile(new URL(`../../dist/${c.abiPath}`, import.meta.url), 'utf8'));
      for (const functionName of ['owner', 'pendingOwner', 'totalSupply', 'MAX_SUPPLY', 'MINT_FEE', 'paused', 'provenanceSet', 'baseURI', 'unrevealedURI', 'metadataFrozen', 'revealed', 'reserveMinted']) {
        try { result.collection[functionName] = await usable.readContract({ address: c.address, abi, functionName }); }
        catch (e) { result.collection[functionName] = { error: e.shortMessage || e.message }; }
      }
    }
  }
  const key = d.poolKey;
  if (key) {
    const poolId = keccak256(encodeAbiParameters(parseAbiParameters('(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'), [key]));
    result.pool.id = poolId;
    for (const [name, address] of Object.entries(d.network.uniswapV4)) {
      if (typeof address !== 'string') continue;
      try { const code = await usable.getCode({ address }); result.pool[name] = { address, codeBytes: code ? (code.length - 2) / 2 : 0 }; }
      catch (e) { result.pool[name] = { error: e.shortMessage || e.message }; }
    }
    try {
      const abi = parseAbi(['function getLiquidity(bytes32) view returns (uint128)', 'function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)']);
      result.pool.liquidity = await usable.readContract({ address: d.network.uniswapV4.stateView, abi, functionName: 'getLiquidity', args: [poolId] });
      result.pool.slot0 = await usable.readContract({ address: d.network.uniswapV4.stateView, abi, functionName: 'getSlot0', args: [poolId] });
    } catch (e) { result.pool.error = e.shortMessage || e.message; }
  }
}
await writeFile(new URL('../../docs/frontend/live-chain.json', import.meta.url), JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
console.log(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
