import { useState, type ReactNode } from 'react';
import { getAddress, type Address } from 'viem';
import type { Runtime } from './config';
import type { Transactions } from './wallet';
export function AddressView({ address, runtime, label }: { address: Address; runtime: Runtime; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return <div className="address-row"><a className="address" href={`${runtime.deployment.network.explorer}/address/${address}`} target="_blank" rel="noreferrer">{getAddress(address)}</a><button type="button" className="copy" aria-label={`Copy ${label} address`} onClick={async () => { try { await navigator.clipboard.writeText(getAddress(address)); setCopied(true); setError(''); } catch { setError('Select the address to copy it.'); } }}>{copied ? 'Copied' : 'Copy'}</button><span className="small" role="status">{error}</span></div>;
}
export function TxFeedback({ id, tx, runtime }: { id: string; tx: Transactions; runtime: Runtime }) {
  const state = tx.states[id];
  return <div className={`tx-feedback ${state?.phase === 'error' ? 'error' : ''}`} aria-live="polite" role="status">
    {state && <><span>{state.message}</span>{state.hash && <a href={`${runtime.deployment.network.explorer}/tx/${state.hash}`} target="_blank" rel="noreferrer">View transaction on Etherscan ↗</a>}{state.uncertain && <button type="button" className="button" onClick={() => void tx.recheck()}>Check confirmation</button>}</>}
  </div>;
}
export function ActionButton({ id, tx, children, disabled, onClick, primary = false }: { id: string; tx: Transactions; children: ReactNode; disabled?: boolean; onClick: () => void; primary?: boolean }) {
  const phase = tx.active === id ? tx.states[id]?.phase : undefined;
  return <button type="button" className={primary ? 'button primary' : 'button'} disabled={disabled || !!tx.active} onClick={onClick} aria-busy={!!phase}>
    {phase === 'simulating' ? 'Checking transaction…' : phase === 'signing' ? 'Confirm in wallet…' : phase === 'pending' ? 'Waiting for confirmation…' : children}
  </button>;
}
export function Icon({ name }: { name: 'arrow' | 'mark' }) {
  return name === 'arrow' ? <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg> : <svg aria-hidden="true" width="32" height="32" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 39V15l15 10h10l15-10v24c0 16-40 16-40 0Z"/><path d="M24 33v6m16-6v6m-12 6h8" /></svg>;
}
