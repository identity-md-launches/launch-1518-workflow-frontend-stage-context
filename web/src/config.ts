import { createPublicClient, custom, defineChain, fallback, http, isAddress, keccak256, toHex, type Abi, type Address, type EIP1193Provider } from 'viem';
export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
export type Deployment = {
  version: 1; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number }; faucets: string[];
    uniswapV4?: { poolManager: Address; universalRouter: Address; quoter: Address; stateView: Address; positionManager: Address; permit2: Address; extendedSwapParams?: boolean };
  };
  walletAddChain?: { chainId: string; chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] };
};
export type Runtime = { deployment: Deployment; abis: Record<string, Abi>; chain: ReturnType<typeof defineChain> };
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, canonical(v)]));
  return value;
}
function safePath(path: string) { return /^[\w./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').some(p => p === '..' || p === '.'); }
export async function loadRuntime(): Promise<Runtime> {
  const res = await fetch(new URL('imd-deployment.json', document.baseURI), { cache: 'no-cache' });
  if (!res.ok) throw new Error('Deployment configuration could not load. Reload the page to retry.');
  const d = await res.json() as Deployment;
  if (d.version !== 1 || !d.network || d.chainId !== d.network.chainId || !d.network.testnet || !d.network.rpcUrls.length) throw new Error('Deployment network verification failed. Transactions are disabled.');
  if (d.walletAddChain && Number(d.walletAddChain.chainId) !== d.chainId) throw new Error('Wallet network settings do not match.');
  const allowed = ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash', 'contracts', 'assets', 'poolKey', 'network', 'walletAddChain'];
  if (Object.keys(d).some(k => !allowed.includes(k))) throw new Error('Unexpected deployment configuration.');
  const abis: Record<string, Abi> = {};
  await Promise.all(d.contracts.map(async c => {
    if (!isAddress(c.address) || !safePath(c.abiPath)) throw new Error('Invalid deployment contract.');
    const r = await fetch(new URL(c.abiPath, document.baseURI));
    if (!r.ok) throw new Error(`Unable to load ${c.name} interface. Reload to retry.`);
    const abi = await r.json();
    if (!Array.isArray(abi) || keccak256(toHex(JSON.stringify(canonical(abi)))).slice(2) !== c.abiHash) throw new Error(`${c.name} interface hash does not match the deployment. Transactions are disabled.`);
    abis[c.name] = abi;
  }));
  if (!abis.SwarmCats || !abis.LaunchToken) throw new Error('The attested contracts are missing.');
  const chain = defineChain({ id: d.chainId, name: d.network.name, nativeCurrency: d.network.nativeCurrency, rpcUrls: { default: { http: d.network.rpcUrls } }, blockExplorers: { default: { name: 'Explorer', url: d.network.explorer } }, testnet: d.network.testnet });
  return { deployment: d, abis, chain };
}
export function contract(runtime: Runtime, name: string) {
  const entry = runtime.deployment.contracts.find(c => c.name === name);
  if (!entry) throw new Error(`Missing contract: ${name}`);
  return { address: entry.address, abi: runtime.abis[name] };
}
export function publicClient(runtime: Runtime, wallet?: EIP1193Provider) {
  return createPublicClient({ chain: runtime.chain, transport: fallback([
    ...runtime.deployment.network.rpcUrls.map(url => http(url, { timeout: 7000, retryCount: 0, batch: { wait: 20, batchSize: 50 } })),
    ...(wallet ? [custom(wallet, { retryCount: 0 })] : []),
  ], { retryCount: 0 }), pollingInterval: 4000 });
}
export type Client = ReturnType<typeof publicClient>;
export async function verifyChain(runtime: Runtime, client: Client) {
  const id = await client.getChainId();
  if (id !== runtime.deployment.chainId) throw new Error('RPC returned the wrong chain. Transactions are disabled.');
  await Promise.all(runtime.deployment.contracts.map(async c => {
    const code = await client.getCode({ address: c.address });
    if (!code || code === '0x') throw new Error(`No deployed code at ${c.name}. Transactions are disabled.`);
  }));
}
