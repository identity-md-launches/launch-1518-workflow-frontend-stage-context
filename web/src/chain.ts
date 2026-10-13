import { BaseError, ContractFunctionRevertedError, getAddress, isAddress, zeroAddress, type Address } from 'viem';
import { contract, type Client, type Runtime } from './config';
export type Collection = {
  totalSupply: bigint; MAX_SUPPLY: bigint; MINT_FEE: bigint; MAX_PER_WALLET: bigint; MAX_RESERVE_SUPPLY: bigint;
  owner: Address; pendingOwner: Address; paused: boolean; provenanceSet: boolean; PROVENANCE_HASH: string;
  baseURI: string; unrevealedURI: string; metadataFrozen: boolean; revealed: boolean; revealSeed: string; reserveMinted: bigint;
  CREATOR: Address; PLATFORM: Address; RESERVE: Address;
  block: bigint; minted: bigint; balance: bigint; eth: bigint; loom: bigint; loomDecimals: number; loomSymbol: string;
};
const reads = ['totalSupply', 'MAX_SUPPLY', 'MINT_FEE', 'MAX_PER_WALLET', 'MAX_RESERVE_SUPPLY', 'owner', 'pendingOwner', 'paused', 'provenanceSet', 'PROVENANCE_HASH', 'baseURI', 'unrevealedURI', 'metadataFrozen', 'revealed', 'revealSeed', 'reserveMinted', 'CREATOR', 'PLATFORM', 'RESERVE'] as const;
export async function readCollection(r: Runtime, client: Client, account?: Address): Promise<Collection> {
  const block = await client.getBlockNumber({ cacheTime: 0 });
  const cats = contract(r, 'SwarmCats'), loom = contract(r, 'LaunchToken');
  const values = await Promise.all(reads.map(functionName => client.readContract({ ...cats, functionName, blockNumber: block })));
  const [minted, balance, eth, tokenBalance, decimals, symbol] = await Promise.all([
    account ? client.readContract({ ...cats, functionName: 'mintedPerWallet', args: [account], blockNumber: block }) : 0n,
    account ? client.readContract({ ...cats, functionName: 'balanceOf', args: [account], blockNumber: block }) : 0n,
    account ? client.getBalance({ address: account, blockNumber: block }) : 0n,
    account ? client.readContract({ ...loom, functionName: 'balanceOf', args: [account], blockNumber: block }) : 0n,
    client.readContract({ ...loom, functionName: 'decimals', blockNumber: block }),
    client.readContract({ ...loom, functionName: 'symbol', blockNumber: block }),
  ]);
  return { ...Object.fromEntries(reads.map((name, i) => [name, values[i]])), block, minted, balance, eth, loom: tokenBalance, loomDecimals: Number(decimals), loomSymbol: symbol } as Collection;
}
export function mintProblem(s: Collection | undefined, quantity: number, account?: Address) {
  if (!s) return 'Checking collection status…';
  if (!s.provenanceSet) return 'Mint opens after the owner sets provenance.';
  if (s.paused) return 'Minting is paused by the owner.';
  if (s.totalSupply >= s.MAX_SUPPLY) return 'All cats have been minted.';
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > Number(s.MAX_PER_WALLET)) return 'Choose a quantity within the wallet limit.';
  if (s.totalSupply + BigInt(quantity) > s.MAX_SUPPLY) return 'Choose fewer cats; this exceeds the remaining supply.';
  if (account && s.minted + BigInt(quantity) > s.MAX_PER_WALLET) return 'This quantity exceeds your lifetime mint allowance.';
  if (account && s.eth <= s.MINT_FEE * BigInt(quantity)) return 'Add Sepolia ETH for the fee and gas.';
  return '';
}
export function addressInput(text: string): Address {
  const value = text.trim();
  if (!isAddress(value) || value.toLowerCase() === zeroAddress) throw new Error('Enter a valid nonzero Ethereum address.');
  return getAddress(value);
}
export function safeUri(uri: string): string | undefined {
  try { const url = new URL(uri); return ['https:', 'ipfs:'].includes(url.protocol) ? uri : undefined; } catch { return undefined; }
}
const messages: Record<string, string> = {
  ProvenanceNotSet: 'The owner must set provenance before minting opens.', EnforcedPause: 'Minting is paused. Try again after the owner reopens it.',
  WalletLimitExceeded: 'Your wallet has reached its lifetime mint limit.', MaxSupplyExceeded: 'There are not enough cats left for this quantity.',
  IncorrectMintFee: 'The mint fee changed or did not match. Refresh the collection and retry.', ReserveLimitExceeded: 'The team reserve allowance is exhausted.',
  MetadataIsFrozen: 'Metadata is permanently frozen.', ProvenanceAlreadySet: 'The provenance commitment is already set.', MintingAlreadyStarted: 'Provenance cannot change after the first mint.',
  RevealAlreadySet: 'The reveal seed is already recorded.', OwnableUnauthorizedAccount: 'This wallet is not authorized for that owner action.',
  TransferCallerNotOwnerNorApproved: 'This wallet does not own the cat or have transfer approval.', FeeTransferFailed: 'A fee recipient rejected payment. No mint was made.',
  InvalidQuantity: 'Choose a valid quantity.', InvalidProvenanceHash: 'Enter the real, nonzero provenance commitment.',
  ExecutionFailed: 'The swap could not execute. Refresh the quote and check liquidity and allowances.', V4TooLittleReceived: 'The price moved beyond your slippage. Request a fresh quote.',
};
export function errorMessage(error: unknown) {
  const e = error as { code?: number; message?: string; shortMessage?: string; cause?: unknown };
  if (e?.code === 4001 || /rejected|denied/i.test(e?.message ?? '')) return 'Request rejected in your wallet. Nothing was submitted; you can retry.';
  if (/insufficient funds/i.test(e?.message ?? '')) return 'Add enough Sepolia ETH for this action and gas, then retry.';
  if (error instanceof BaseError) {
    const reverted = error.walk(e => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError;
    const name = reverted?.data?.errorName;
    if (name) return messages[name] ?? `The contract refused this action (${name}). Refresh its state before retrying.`;
    return error.shortMessage.length < 260 ? error.shortMessage : 'The network request failed. Check your connection and retry.';
  }
  return e?.message?.slice(0, 300) || 'The request failed. Please retry.';
}
export type Cat = { id: bigint; uri: string };
export async function ownedCats(r: Runtime, client: Client, account: Address, s: Collection, signal: AbortSignal, progress: (n: number) => void): Promise<Cat[]> {
  if (!s.balance) return [];
  const cats = contract(r, 'SwarmCats');
  const found: Cat[] = [];
  // This collection is non-enumerable. Read ownership at one block, including transfers,
  // and stop once balanceOf is satisfied. No indexer or invented token list.
  for (let start = 1; start <= Number(s.totalSupply); start += 40) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const ids = Array.from({ length: Math.min(40, Number(s.totalSupply) - start + 1) }, (_, i) => BigInt(start + i));
    const owners = await Promise.all(ids.map(id => client.readContract({ ...cats, functionName: 'ownerOf', args: [id], blockNumber: s.block })));
    for (let i = 0; i < ids.length; i++) {
      if (String(owners[i]).toLowerCase() === account.toLowerCase()) {
        const uri = await client.readContract({ ...cats, functionName: 'tokenURI', args: [ids[i]], blockNumber: s.block }) as string;
        found.push({ id: ids[i], uri });
      }
    }
    progress(Math.min(start + 39, Number(s.totalSupply)));
    if (found.length >= Number(s.balance)) break;
  }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  return found;
}
