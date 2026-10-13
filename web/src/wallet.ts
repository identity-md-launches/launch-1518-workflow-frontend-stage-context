import { useCallback, useEffect, useRef, useState } from 'react';
import { createWalletClient, custom, getAddress, toHex, type Address, type EIP1193Provider, type Hash, type Abi } from 'viem';
import { errorMessage } from './chain';
import { verifyChain, type Client, type Runtime } from './config';
export type Provider = EIP1193Provider & { on?: (event: string, listener: (...args: any[]) => void) => void; removeListener?: (event: string, listener: (...args: any[]) => void) => void };
export type WalletOption = { id: string; name: string; provider: Provider };
declare global { interface Window { ethereum?: Provider } }
export function useWallet(r: Runtime) {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [provider, setProvider] = useState<Provider>();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const session = useRef(0);
  useEffect(() => {
    const announce = (event: Event) => {
      const { info, provider } = (event as CustomEvent<{ info: { uuid: string; name: string }; provider: Provider }>).detail;
      if (!provider?.request || !info?.uuid) return;
      setOptions(current => [...current.filter(x => x.id !== 'injected'), ...(!current.some(x => x.id === info.uuid) ? [{ id: info.uuid, name: info.name.slice(0, 60), provider }] : [])]);
    };
    if (window.ethereum) setOptions([{ id: 'injected', name: 'Browser wallet', provider: window.ethereum }]);
    window.addEventListener('eip6963:announceProvider', announce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', announce);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const accounts = (values: string[]) => { session.current++; setAccount(values[0] ? getAddress(values[0]) : undefined); setError(''); };
    const chain = (value: string) => { session.current++; setChainId(Number(value)); setError(''); };
    const disconnect = () => { session.current++; setAccount(undefined); setChainId(undefined); };
    provider.on?.('accountsChanged', accounts); provider.on?.('chainChanged', chain); provider.on?.('disconnect', disconnect);
    return () => { provider.removeListener?.('accountsChanged', accounts); provider.removeListener?.('chainChanged', chain); provider.removeListener?.('disconnect', disconnect); };
  }, [provider]);
  const connect = async (id?: string) => {
    if (busyRef.current) return;
    const selected = options.find(x => x.id === id) ?? options[0];
    if (!selected) { setError('No browser wallet found. Open this site in a wallet browser or install an Ethereum browser wallet, then reload.'); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const values = await selected.provider.request({ method: 'eth_requestAccounts' });
      const id = await selected.provider.request({ method: 'eth_chainId' });
      if (!values[0]) throw new Error('No account shared. Unlock your wallet and retry.');
      session.current++; setProvider(selected.provider); setAccount(getAddress(values[0])); setChainId(Number(id));
    } catch (e) { setError(errorMessage(e)); } finally { busyRef.current = false; setBusy(false); }
  };
  const switchChain = async () => {
    if (!provider || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const params: [{ chainId: string }] = [{ chainId: toHex(r.deployment.chainId) }];
      try { await provider.request({ method: 'wallet_switchEthereumChain', params }); }
      catch (e) {
        const err = e as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
        if ((err.code === 4902 || err.data?.originalError?.code === 4902 || /unknown chain|unrecognized chain|not added/i.test(err.message ?? '')) && r.deployment.walletAddChain) {
          await provider.request({ method: 'wallet_addEthereumChain', params: [r.deployment.walletAddChain] });
          await provider.request({ method: 'wallet_switchEthereumChain', params });
        } else throw e;
      }
      setChainId(Number(await provider.request({ method: 'eth_chainId' }))); session.current++;
    } catch (e) { setError(errorMessage(e)); } finally { busyRef.current = false; setBusy(false); }
  };
  const disconnect = () => { session.current++; setProvider(undefined); setAccount(undefined); setChainId(undefined); setError(''); };
  return { options, provider, account, chainId, busy, error, session, connect, disconnect, switchChain, correctChain: chainId === r.deployment.chainId };
}
export type Wallet = ReturnType<typeof useWallet>;
export type TxState = { phase: 'simulating' | 'signing' | 'pending' | 'confirmed' | 'error'; message: string; hash?: Hash; uncertain?: boolean };
export type Write = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };
export function useTransactions(r: Runtime, client: Client, wallet: Wallet, refresh: () => Promise<void>) {
  const [states, setStates] = useState<Record<string, TxState>>({});
  const [active, setActive] = useState('');
  const lock = useRef(false);
  const unresolved = useRef<{ key: string; label: string; hash: Hash; replaced: boolean } | null>(null);
  const rechecking = useRef(false);
  const latestWallet = useRef(wallet); latestWallet.current = wallet;
  const assertWallet = useCallback(async (expected: Address, expectedSession: number) => {
    const w = latestWallet.current;
    if (!w.provider || w.session.current !== expectedSession) throw new Error('The wallet changed. Review the action and retry.');
    const [id, accounts] = await Promise.all([w.provider.request({ method: 'eth_chainId' }), w.provider.request({ method: 'eth_accounts' })]);
    if (Number(id) !== r.deployment.chainId || accounts[0]?.toLowerCase() !== expected.toLowerCase()) throw new Error('The wallet account or network changed. Review and retry.');
  }, [r]);
  const send = async (key: string, label: string, request: Write | (() => Promise<Write>)) => {
    if (lock.current) return false;
    lock.current = true; setActive(key);
    let hash: Hash | undefined;
    let terminal = false;
    let replacementReason = ''; 
    const update = (state: TxState) => setStates(s => ({ ...s, [key]: state }));
    try {
      const { account, provider, correctChain, session } = latestWallet.current;
      const expectedSession = session.current;
      if (!account || !provider || !correctChain) throw new Error('Connect your wallet to the configured network first.');
      update({ phase: 'simulating', message: `Checking ${label.toLowerCase()}…` });
      await assertWallet(account, expectedSession);
      await verifyChain(r, client);
      const action = typeof request === 'function' ? await request() : request;
      const simulation = await client.simulateContract({ ...action, account });
      await assertWallet(account, expectedSession);
      update({ phase: 'signing', message: `Confirm ${label.toLowerCase()} in your wallet.` });
      const signer = createWalletClient({ chain: r.chain, transport: custom(provider) });
      hash = await signer.writeContract(simulation.request);
      update({ phase: 'pending', message: `${label} submitted. Waiting for confirmation…`, hash });
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180_000, onReplaced: replacement => {
        hash = replacement.transaction.hash;
        update({ phase: 'pending', message: replacement.reason === 'cancelled' ? 'Wallet cancellation submitted. Waiting for confirmation…' : 'Replacement transaction submitted. Waiting for confirmation…', hash });
        replacementReason = replacement.reason;
      } });
      terminal = true;
      if (replacementReason === 'cancelled' || replacementReason === 'replaced') throw new Error('The transaction was cancelled or replaced in your wallet. Check the explorer before retrying.');
      if (receipt.status !== 'success') throw new Error('The transaction reverted. No contract changes were made. Review the explorer and retry.');
      update({ phase: 'confirmed', message: `${label} confirmed.`, hash });
      await refresh();
      return true;
    } catch (e) {
      if (hash && !terminal) {
        unresolved.current = { key, label, hash, replaced: replacementReason === 'cancelled' || replacementReason === 'replaced' };
        update({ phase: 'pending', message: 'The transaction was submitted, but confirmation is unavailable. Check its status before another transaction.', hash, uncertain: true });
      } else update({ phase: 'error', message: errorMessage(e), hash });
      return false;
    } finally { if (!hash || terminal) { lock.current = false; setActive(''); } }
  };
  const recheck = async () => {
    const pending = unresolved.current;
    if (!pending || rechecking.current) return;
    rechecking.current = true;
    try {
      const receipt = await client.getTransactionReceipt({ hash: pending.hash });
      setStates(s => ({ ...s, [pending.key]: { phase: receipt.status === 'success' && !pending.replaced ? 'confirmed' : 'error', message: pending.replaced ? 'The transaction was cancelled or replaced. Review the explorer before retrying.' : receipt.status === 'success' ? `${pending.label} confirmed.` : 'The transaction reverted. Review the explorer before retrying.', hash: pending.hash } }));
      unresolved.current = null; lock.current = false; setActive(''); await refresh();
    } catch {
      setStates(s => ({ ...s, [pending.key]: { phase: 'pending', message: 'Confirmation is still unavailable. Check the explorer or retry this status check.', hash: pending.hash, uncertain: true } }));
    } finally { rechecking.current = false; }
  };
  return { states, active, send, recheck };
}
export type Transactions = ReturnType<typeof useTransactions>;
