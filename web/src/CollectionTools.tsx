import { useEffect, useState } from 'react';
import { formatUnits, parseUnits, zeroAddress, isAddress, type Address } from 'viem';
import { addressInput, errorMessage, type Collection } from './chain';
import { contract, type Client, type Runtime } from './config';
import { ActionButton, TxFeedback } from './components';
import type { Transactions, Wallet } from './wallet';
export function CollectionTools({ r, client, s, wallet, tx, ready }: { r: Runtime; client: Client; s: Collection; wallet: Wallet; tx: Transactions; ready: boolean }) {
  const [asset, setAsset] = useState('cat');
  const [action, setAction] = useState('transfer');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [permission, setPermission] = useState(false);
  const [checked, setChecked] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const isCat = asset === 'cat';
  const c = contract(r, isCat ? 'SwarmCats' : 'LaunchToken');
  useEffect(() => { setChecked(''); setError(''); }, [recipient, amount, asset, action, wallet.account]);
  const check = async () => {
    if (!wallet.account) return;
    setChecking(true); setError('');
    try {
      const address = action === 'revoke' ? zeroAddress : addressInput(recipient);
      if (!isCat) {
        const allowance = await client.readContract({ ...c, functionName: 'allowance', args: [wallet.account, address] }) as bigint;
        setChecked(`Current allowance: ${formatUnits(allowance, s.loomDecimals)} ${s.loomSymbol}.`);
      } else if (action === 'operator') {
        const value = await client.readContract({ ...c, functionName: 'isApprovedForAll', args: [wallet.account, address] });
        setChecked(`Operator is ${value ? 'approved' : 'not approved'} for all your cats.`);
      } else {
        if (!/^\d+$/.test(amount) || BigInt(amount) < 1n) throw new Error('Enter a valid token ID.');
        const owner = await client.readContract({ ...c, functionName: 'ownerOf', args: [BigInt(amount)] }) as Address;
        const approved = await client.readContract({ ...c, functionName: 'getApproved', args: [BigInt(amount)] }) as Address;
        setChecked(`Owner: ${owner}. Approved address: ${approved}.`);
      }
    } catch (e) { setError(errorMessage(e)); } finally { setChecking(false); }
  };
  const submit = async () => {
    await tx.send('asset-action', action === 'transfer' ? 'Transfer' : 'Update approval', async () => {
      const address = action === 'revoke' ? zeroAddress : addressInput(recipient);
      if (!wallet.account) throw new Error('Connect your wallet first.');
      if (isCat && action === 'operator') return { ...c, functionName: 'setApprovalForAll', args: [address, permission] };
      if (isCat) {
        if (!/^\d+$/.test(amount) || BigInt(amount) < 1n) throw new Error('Enter a valid token ID.');
        const owner = await client.readContract({ ...c, functionName: 'ownerOf', args: [BigInt(amount)] }) as Address;
        if (owner.toLowerCase() !== wallet.account.toLowerCase()) throw new Error('This cat is not owned by your connected wallet.');
        return action === 'transfer' ? { ...c, functionName: 'safeTransferFrom', args: [wallet.account, address, BigInt(amount)] } : { ...c, functionName: 'approve', args: [address, BigInt(amount)] };
      }
      if (!/^\d+(\.\d+)?$/.test(amount) || (amount.split('.')[1]?.length ?? 0) > s.loomDecimals) throw new Error(`Use up to ${s.loomDecimals} decimals.`);
      const units = parseUnits(amount, s.loomDecimals);
      if (action === 'transfer' && units <= 0n) throw new Error('Enter a positive transfer amount.');
      return { ...c, functionName: action === 'transfer' ? 'transfer' : 'approve', args: [address, units] };
    });
  };
  return <details className="tools"><summary>Transfers & approvals</summary><p className="muted">Transfers have no collection fee. Network gas still applies.</p>
    <div className="tools-grid"><div><label htmlFor="asset">Asset</label><select id="asset" value={asset} onChange={e => { setAsset(e.target.value); setAction('transfer'); setAmount(''); }}><option value="cat">Swarm Cat</option><option value="loom">{s.loomSymbol}</option></select></div><div><label htmlFor="asset-action">Action</label><select id="asset-action" value={action} onChange={e => setAction(e.target.value)}><option value="transfer">Transfer</option><option value="approve">Approve spender</option>{isCat && <option value="revoke">Revoke token approval</option>}{isCat && <option value="operator">Set operator permission</option>}</select></div></div>
    {action !== 'revoke' && <><label htmlFor="transfer-recipient">{action === 'transfer' ? 'Recipient address' : 'Spender / operator address'}</label><input id="transfer-recipient" value={recipient} onChange={e => setRecipient(e.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!!recipient && (!isAddress(recipient.trim()) || recipient.trim() === zeroAddress)}/></>}
    {action !== 'operator' && <><label htmlFor="transfer-amount">{isCat ? 'Token ID' : `Amount in ${s.loomSymbol}`}</label><input id="transfer-amount" value={amount} onChange={e => setAmount(e.target.value)} inputMode={isCat ? 'numeric' : 'decimal'}/></>}
    {action === 'operator' && <label className="checkbox"><input type="checkbox" checked={permission} onChange={e => setPermission(e.target.checked)}/>Allow this operator to transfer all my cats</label>}
    <p className="small muted">{action === 'transfer' ? 'Review the full recipient address. A confirmed transfer cannot be undone.' : action === 'operator' ? 'Unchecked revokes permission. Only approve an operator you trust.' : isCat ? action === 'revoke' ? 'Remove the address currently approved for this cat.' : 'This address will be allowed to transfer the selected cat.' : 'This allowance lets the spender move your tokens. Use 0 to revoke an allowance.'}</p>
    <button type="button" className="button" onClick={() => void check()} disabled={!wallet.account || checking || !!tx.active}>{checking ? 'Reading permissions…' : 'Check owner / allowance'}</button><p className="small break" role="status">{checked}</p><p className="error" role="alert">{error}</p>
    <ActionButton id="asset-action" tx={tx} disabled={!ready || (action !== 'revoke' && !recipient) || (action !== 'operator' && !amount)} onClick={() => void submit()}>{action === 'transfer' ? 'Transfer asset' : action === 'operator' && !permission ? 'Revoke operator permission' : action === 'revoke' ? 'Revoke token approval' : 'Update approval'}</ActionButton><TxFeedback id="asset-action" tx={tx} runtime={r}/>
  </details>;
}
