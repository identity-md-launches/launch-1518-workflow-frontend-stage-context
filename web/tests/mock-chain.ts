import { readFileSync } from 'node:fs';
import { decodeFunctionData, encodeFunctionResult, encodeErrorResult, parseEther, zeroAddress, type Abi, type Address, type Hex } from 'viem';
import type { Page } from '@playwright/test';
import { erc20Abi, permitAbi, quoterAbi, routerAbi, stateAbi } from '../src/swap';
export const deployment = JSON.parse(readFileSync(new URL('../../dist/imd-deployment.json', import.meta.url), 'utf8'));
export const catEntry = deployment.contracts.find((c: any) => c.name === 'SwarmCats');
export const loomEntry = deployment.contracts.find((c: any) => c.name === 'LaunchToken');
export const catsAbi: Abi = JSON.parse(readFileSync(new URL(`../../dist/${catEntry.abiPath}`, import.meta.url), 'utf8'));
export const loomAbi: Abi = JSON.parse(readFileSync(new URL(`../../dist/${loomEntry.abiPath}`, import.meta.url), 'utf8'));
// These are isolated test identities. The owner was read from the deployed contract.
export const owner = '0x02b4bd9cc103fD502B2F3f601E29E6Ae2039AC85' as Address;
export const visitor = '0x1234567890123456789012345678901234567890' as Address;
const hash = `0x${'ab'.repeat(32)}`;
const blockHash = `0x${'cd'.repeat(32)}`;
export type MockOptions = { owner?: boolean; provenance?: boolean; paused?: boolean; totalSupply?: bigint; minted?: bigint; balance?: bigint; liquidity?: bigint; wrongChain?: boolean; reject?: boolean; revert?: boolean; missingCode?: boolean; rpcWrongChain?: boolean; failRpc?: boolean; frozen?: boolean; quoteFail?: boolean; longBalance?: boolean };
export async function mockChain(page: Page, opts: MockOptions = {}) {
  const account = opts.owner ? owner : visitor;
  const state = {
    supply: opts.totalSupply ?? 12n, minted: opts.minted ?? 0n, balance: opts.balance ?? 0n,
    provenance: opts.provenance ?? true, paused: opts.paused ?? false,
    allowance: 0n, permit: 0n, permitExpiry: 0, frozen: opts.frozen ?? false,
    reserve: 0n, baseURI: '', hiddenURI: '', seedSet: false, hashSet: false,
  };
  const calls: { method: string; params: any[] }[] = [];
  const writes: { to: string; data: Hex; value?: string }[] = [];
  let lastTx: any;
  let sent = 0;
  let blockNumber = 11904736n;
  const block = () => ({ number: '0xb5a6e0', hash: blockHash, parentHash: blockHash, timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`, gasLimit: '0x1c9c380', gasUsed: '0x5208', baseFeePerGas: '0x3b9aca00', difficulty: '0x0', extraData: '0x', logsBloom: `0x${'00'.repeat(256)}`, miner: zeroAddress, mixHash: blockHash, nonce: '0x0000000000000000', receiptsRoot: blockHash, sha3Uncles: blockHash, size: '0x200', stateRoot: blockHash, totalDifficulty: '0x0', transactions: [], transactionsRoot: blockHash, uncles: [] });
  const getAbi = (address: string) => {
    const a = address.toLowerCase(), u = deployment.network.uniswapV4;
    if (a === catEntry.address.toLowerCase()) return catsAbi;
    if (a === loomEntry.address.toLowerCase()) return loomAbi;
    if (a === u.quoter.toLowerCase()) return quoterAbi;
    if (a === u.stateView.toLowerCase()) return stateAbi;
    if (a === u.permit2.toLowerCase()) return permitAbi;
    if (a === u.universalRouter.toLowerCase()) return routerAbi;
    return erc20Abi;
  };
  const handle = async (method: string, params: any[] = []): Promise<any> => {
    calls.push({ method, params });
    if (method === 'eth_chainId') return opts.rpcWrongChain ? '0x1' : deployment.walletAddChain.chainId;
    if (method === 'eth_getCode') return opts.missingCode ? '0x' : '0x6001600055';
    if (method === 'eth_blockNumber') return `0x${(blockNumber++).toString(16)}`;
    if (method === 'eth_getBalance') return `0x${parseEther(opts.longBalance ? '123456789012345678901234567890.123456789012345678' : '100').toString(16)}`;
    if (method === 'eth_getBlockByNumber') return block();
    if (method === 'eth_gasPrice' || method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00';
    if (method === 'eth_estimateGas') return '0x100000';
    if (method === 'eth_getTransactionCount') return '0x0';
    if (method === 'eth_getTransactionByHash') return { ...lastTx, hash, blockHash, blockNumber: '0xb5a6e0', transactionIndex: '0x0', from: account, nonce: '0x0', gas: '0x100000', gasPrice: '0x3b9aca00', value: lastTx?.value || '0x0', input: lastTx?.data || '0x', type: '0x0', v: '0x1b', r: hash, s: hash };
    if (method === 'eth_getTransactionReceipt') return sent ? { transactionHash: hash, transactionIndex: '0x0', blockHash, blockNumber: '0xb5a6e0', from: account, to: lastTx.to, cumulativeGasUsed: '0x100000', gasUsed: '0x100000', contractAddress: null, logs: [], logsBloom: `0x${'00'.repeat(256)}`, status: '0x1', effectiveGasPrice: '0x3b9aca00', type: '0x0' } : null;
    if (method === 'eth_call' || method === 'eth_sendTransaction') {
      const request = params[0], abi = getAbi(request.to);
      const decoded = decodeFunctionData({ abi, data: request.data });
      const name = decoded.functionName, args = decoded.args as any[] || [];
      const isCat = request.to.toLowerCase() === catEntry.address.toLowerCase();
      const isLoom = request.to.toLowerCase() === loomEntry.address.toLowerCase();
      const isPermit = request.to.toLowerCase() === deployment.network.uniswapV4.permit2.toLowerCase();
      if (method === 'eth_sendTransaction') {
        sent++; lastTx = request; writes.push(request);
        if (name === 'mint') { state.supply += args[0]; state.minted += args[0]; state.balance += args[0]; }
        if (name === 'reserveMint') { state.supply += args[0]; state.reserve += args[0]; }
        if (name === 'approve' && isLoom) state.allowance = args[1];
        if (name === 'approve' && isPermit) { state.permit = args[2]; state.permitExpiry = args[3]; }
        if (name === 'setProvenanceHash') { state.provenance = true; state.hashSet = true; }
        if (name === 'setBaseURI') state.baseURI = args[0];
        if (name === 'setUnrevealedURI') state.hiddenURI = args[0];
        if (name === 'setRevealSeed') state.seedSet = true;
        if (name === 'pause') state.paused = true;
        if (name === 'unpause') state.paused = false;
        if (name === 'freezeMetadata') state.frozen = true;
        return hash;
      }
      const values: Record<string, any> = {
        totalSupply: isCat ? state.supply : parseEther('1000000000'), MAX_SUPPLY: 10000n, MINT_FEE: parseEther('0.0005'), MAX_PER_WALLET: 5n, MAX_RESERVE_SUPPLY: 100n,
        owner, pendingOwner: zeroAddress, paused: state.paused, provenanceSet: state.provenance, PROVENANCE_HASH: `0x${'12'.repeat(32)}`, baseURI: state.baseURI, unrevealedURI: state.hiddenURI, metadataFrozen: state.frozen, revealed: state.seedSet, revealSeed: `0x${'34'.repeat(32)}`, reserveMinted: state.reserve,
        CREATOR: owner, PLATFORM: owner, RESERVE: owner, mintedPerWallet: state.minted, balanceOf: isCat ? state.balance : parseEther(opts.longBalance ? '123456789012345678901234567890' : '1000'), decimals: 18, symbol: 'LOOM',
        ownerOf: args[0] <= state.balance ? account : owner, tokenURI: state.baseURI ? `${state.baseURI}${args[0]}.json` : state.hiddenURI,
        getLiquidity: opts.liquidity ?? 10000000000n, getSlot0: [2n ** 96n, 0, 0, deployment.poolKey.fee],
        quoteExactInputSingle: [parseEther('4.25'), 150000n],
        allowance: isPermit ? [state.permit, state.permitExpiry, 0] : state.allowance,
        getApproved: zeroAddress, isApprovedForAll: false,
      };
      if (name === 'mint' && opts.revert) throw { code: 3, message: 'execution reverted', data: encodeErrorResult({ abi: catsAbi, errorName: 'WalletLimitExceeded' }) };
      if (name === 'quoteExactInputSingle' && opts.quoteFail) throw { code: 3, message: 'execution reverted: insufficient liquidity' };
      if (name in values) return encodeFunctionResult({ abi, functionName: name, result: values[name] });
      if (name === 'approve' && isLoom) return encodeFunctionResult({ abi, functionName: name, result: true });
      return '0x';
    }
    throw new Error(`Unhandled mock method ${method}`);
  };
  await page.exposeFunction('__mockRpc', async (method: string, params: any[]) => {
    try { return { result: await handle(method, params) }; } catch (e: any) { return { error: { code: e.code || -32000, message: e.message || 'Mock RPC error', data: e.data } }; }
  });
  await page.addInitScript(({ account, expectedChain, wrongChain, reject }) => {
    const w = window as any;
    let chain = wrongChain ? '0x1' : expectedChain;
    let added = !wrongChain;
    const listeners: Record<string, Function[]> = {};
    w.__walletCalls = [];
    w.__walletReject = reject;
    w.__account = account;
    w.ethereum = {
      on: (event: string, fn: Function) => { (listeners[event] ||= []).push(fn); },
      removeListener: (event: string, fn: Function) => { listeners[event] = (listeners[event] || []).filter(f => f !== fn); },
      request: async ({ method, params }: any) => {
        w.__walletCalls.push({ method, params });
        if ((method === 'eth_requestAccounts' || method === 'eth_sendTransaction') && w.__walletReject) throw { code: 4001, message: 'User rejected the request' };
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [w.__account];
        if (method === 'eth_chainId') return chain;
        if (method === 'wallet_switchEthereumChain') { if (!added) throw { code: 4902, message: 'Unknown chain' }; chain = expectedChain; for (const fn of listeners.chainChanged || []) fn(chain); return null; }
        if (method === 'wallet_addEthereumChain') { added = true; return null; }
        const response = await w.__mockRpc(method, params || []);
        if (response.error) throw response.error;
        return response.result;
      },
    };
    w.__changeAccount = (next: string) => { w.__account = next; for (const fn of listeners.accountsChanged || []) fn(next ? [next] : []); };
    w.__changeChain = (next: string) => { chain = next; for (const fn of listeners.chainChanged || []) fn(next); };
  }, { account, expectedChain: deployment.walletAddChain.chainId, wrongChain: opts.wrongChain || false, reject: opts.reject || false });
  for (const url of deployment.network.rpcUrls) await page.route(url + '**', async route => {
    if (opts.failRpc) { await route.abort(); return; }
    const request = route.request().postDataJSON();
    const reply = async (entry: any) => {
      try { return { jsonrpc: '2.0', id: entry.id, result: await handle(entry.method, entry.params) }; }
      catch (e: any) { return { jsonrpc: '2.0', id: entry.id, error: { code: e.code || -32000, message: e.message || 'Mock RPC error', data: e.data } }; }
    };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(request) ? await Promise.all(request.map(reply)) : await reply(request)) });
  });
  return { state, calls, writes, account };
}
