import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEther } from 'viem';
import { errorMessage, mintProblem, ownedCats, readCollection, safeUri, type Cat, type Collection } from './chain';
import { contract, publicClient, verifyChain, type Runtime } from './config';
import { ActionButton, AddressView, Icon, TxFeedback } from './components';
import { useTransactions, useWallet } from './wallet';
import { OwnerPanel } from './OwnerPanel';
import { TradePanel } from './TradePanel';
import { CollectionTools } from './CollectionTools';
export function App({ runtime: r }: { runtime: Runtime }) {
  const wallet = useWallet(r);
  const client = useMemo(() => publicClient(r, wallet.correctChain ? wallet.provider : undefined), [r, wallet.provider, wallet.correctChain]);
  const [state, setState] = useState<Collection>();
  const [verified, setVerified] = useState(false);
  const [readError, setReadError] = useState('');
  const [reading, setReading] = useState(true);
  const [updated, setUpdated] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedWallet, setSelectedWallet] = useState('');
  const [cats, setCats] = useState<Cat[]>();
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [tradeOpen, setTradeOpen] = useState(false);
  const scanController = useRef<AbortController | null>(null);
  const refreshVersion = useRef(0);
  const inFlight = useRef(0);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const version = ++refreshVersion.current;
    inFlight.current = version;
    setReading(true);
    try {
      await verifyChain(r, client);
      const value = await readCollection(r, client, wallet.account);
      if (version !== refreshVersion.current) return;
      setState(value); setVerified(true); setReadError(''); setUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) { if (version === refreshVersion.current) { setReadError(errorMessage(e)); setVerified(false); } }
    finally { if (version === refreshVersion.current) setReading(false); if (inFlight.current === version) inFlight.current = 0; }
  }, [r, client, wallet.account]);
  useEffect(() => {
    setState(undefined); setVerified(false); setCats(undefined); scanController.current?.abort(); void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15_000);
    return () => { clearInterval(timer); refreshVersion.current++; inFlight.current = 0; };
  }, [refresh]);
  const afterTransaction = async () => { setCats(undefined); scanController.current?.abort(); await refresh(); };
  const tx = useTransactions(r, client, wallet, afterTransaction);
  const ready = !!wallet.account && wallet.correctChain && verified && !!state && !readError;
  const problem = readError ? 'Live state is unavailable. Retry the connection below.' : mintProblem(state, quantity, wallet.account);
  const catsContract = contract(r, 'SwarmCats');
  const connect = () => void wallet.connect(selectedWallet || undefined);
  const mint = async () => {
    await tx.send('mint', `Mint ${quantity} ${quantity === 1 ? 'cat' : 'cats'}`, async () => {
      const fresh = await readCollection(r, client, wallet.account);
      const reason = mintProblem(fresh, quantity, wallet.account);
      if (reason) throw new Error(reason);
      return { ...catsContract, functionName: 'mint', args: [BigInt(quantity)], value: fresh.MINT_FEE * BigInt(quantity) };
    });
  };
  const loadCats = async () => {
    if (!state || !wallet.account) return;
    scanController.current?.abort();
    const controller = new AbortController(); scanController.current = controller;
    setScanning(true); setScanned(0); setScanError('');
    try {
      const fresh = await readCollection(r, client, wallet.account);
      const owned = await ownedCats(r, client, wallet.account, fresh, controller.signal, setScanned);
      if (!controller.signal.aborted) setCats(owned);
    } catch (e) { if (!controller.signal.aborted) setScanError(errorMessage(e)); }
    finally { if (scanController.current === controller) setScanning(false); }
  };
  useEffect(() => { if (state && wallet.account && cats === undefined && !scanning) { if (state.balance === 0n) setCats([]); } }, [state, wallet.account, cats, scanning]);
  useEffect(() => () => scanController.current?.abort(), []);
  return <>
    <a className="skip-link" href="#mint">Skip to mint</a>
    <header className="site-header"><a className="wordmark" href="#mint" aria-label="Swarm Cats home"><Icon name="mark"/><span>Swarm Cats</span></a><div className="header-tools"><span className="network"><span className="status-dot"/>{r.deployment.network.name}</span>
      {!wallet.account ? <button type="button" className="button wallet-button" onClick={connect} disabled={wallet.busy}>{wallet.busy ? 'Connecting…' : 'Connect wallet'}</button> : <details className="wallet-menu"><summary>Wallet connected</summary><div className="wallet-panel"><p>Connected address</p><AddressView address={wallet.account} runtime={r} label="wallet"/><p>{wallet.correctChain ? r.deployment.network.name : 'Wrong network'}</p><button className="button" type="button" onClick={wallet.disconnect} disabled={!!tx.active}>Disconnect</button></div></details>}
    </div></header>
    <main>
      <section className="mint-layout" id="mint" aria-labelledby="page-title">
        <div className="intro"><h1 id="page-title">Mint your<br/> <span>Swarm Cat.</span></h1><p className="intro-copy">10,000 PFPs drawn by the IMD swarm.</p>
          <div className="collection-stamp" aria-hidden="true"><span>SC</span><div className="stamp-line"/><span>10,000</span></div>
          <div className="intro-footer"><span>Made by the swarm.</span><a href={`${r.deployment.network.explorer}/address/${catsContract.address}`} target="_blank" rel="noreferrer">View collection ↗</a></div>
        </div>
        <div className="mint-panel">
          <div className="section-heading"><h2>Public mint</h2><span className={`availability ${state && !state.paused && state.provenanceSet && state.totalSupply < state.MAX_SUPPLY ? 'is-open' : ''}`}>{!verified ? 'Checking' : state?.paused ? 'Paused' : !state?.provenanceSet ? 'Awaiting setup' : state.totalSupply >= state.MAX_SUPPLY ? 'Sold out' : 'Open'}</span></div>
          <div className="supply-row"><strong>{state ? Number(state.totalSupply).toLocaleString() : '…'}</strong><span>/ {state ? Number(state.MAX_SUPPLY).toLocaleString() : '10,000'} minted</span></div>
          <progress aria-label="Collection minted" max={Number(state?.MAX_SUPPLY ?? 10000n)} value={Number(state?.totalSupply ?? 0n)}/>
          <div className="fee-row"><span>Mint price</span><strong>Free</strong></div><div className="fee-row"><span>Protocol fee / cat</span><span>{state ? `${formatEther(state.MINT_FEE)} ETH` : 'Reading…'}</span></div>
          <div className="quantity-row"><label htmlFor="quantity">Quantity</label><div className="quantity-control"><button type="button" aria-label="Mint one fewer cat" onClick={() => setQuantity(n => Math.max(1, n - 1))} disabled={quantity <= 1 || !!tx.active}>−</button><select id="quantity" value={quantity} onChange={e => setQuantity(Number(e.target.value))} disabled={!!tx.active}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select><button type="button" aria-label="Mint one more cat" onClick={() => setQuantity(n => Math.min(5, n + 1))} disabled={quantity >= 5 || !!tx.active}>+</button></div></div>
          <p className="small muted allowance">{wallet.account && state ? `${Math.max(0, Number(state.MAX_PER_WALLET - state.minted))} of ${state.MAX_PER_WALLET.toString()} lifetime mints remaining` : 'Up to 5 cats per wallet, across all mints.'}</p>
          <div className="total-row"><span>Total protocol fee</span><strong>{state ? `${formatEther(state.MINT_FEE * BigInt(quantity))} ETH` : 'Reading…'}</strong></div>
          {!wallet.account ? <button type="button" className="button primary" onClick={connect} disabled={wallet.busy}>{wallet.busy ? 'Connecting…' : 'Connect to mint'}<Icon name="arrow"/></button> : !wallet.correctChain ? <button type="button" className="button primary" onClick={() => void wallet.switchChain()} disabled={wallet.busy}>{wallet.busy ? 'Switching network…' : `Switch to ${r.deployment.network.name}`}</button> : <ActionButton id="mint" tx={tx} primary disabled={!ready || !!problem} onClick={() => void mint()}>Mint {quantity} {quantity === 1 ? 'cat' : 'cats'}<Icon name="arrow"/></ActionButton>}
          <p className="small muted gas-note">Gas is additional. Sepolia testnet only.</p>
          <div className="mint-status" role="status">{problem && <p>{problem}</p>}{wallet.account && !wallet.correctChain && <p>Wallet is on a different network.</p>}</div>
          <TxFeedback id="mint" tx={tx} runtime={r}/>
          {wallet.error && <p className="error" role="alert">{wallet.error}</p>}
          {wallet.options.length > 1 && !wallet.account && <><label htmlFor="wallet-choice">Browser wallet</label><select id="wallet-choice" value={selectedWallet || wallet.options[0].id} onChange={e => setSelectedWallet(e.target.value)}>{wallet.options.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></>}
        </div>
      </section>
      <div className="live-strip"><span className="small">{verified && state ? `Live at block ${state.block.toString()} · Updated ${updated}` : readError ? 'Live connection unavailable' : 'Verifying deployment and reading Sepolia…'}</span><button className="text-button" type="button" onClick={() => void refresh()} disabled={reading}>{reading ? 'Refreshing…' : 'Refresh state'}</button></div>
      {readError && <div className="notice error" role="alert">{readError} Public RPCs are retried in order. {wallet.correctChain ? 'Your wallet provider is the final fallback.' : 'A connected Sepolia wallet can provide a fallback.'}</div>}
      <section className="section" id="collection"><div className="section-heading"><h2>Your cats</h2><span className="small">{wallet.account && state ? `${state.balance.toString()} held in this wallet` : 'A place for your collection'}</span></div>
        {!wallet.account ? <div className="empty-collection"><span className="collection-index" aria-hidden="true">01 /</span><div><h3>Your swarm starts here.</h3><p className="muted">Connect your wallet to see the cats you hold.</p></div></div> : <>
          {state && <p className="small break">Wallet balance: {formatEther(state.eth)} ETH</p>}
          {cats?.length === 0 ? <p className="muted">No cats in this wallet yet. Mint above when the collection opens, or receive a cat by transfer.</p> : cats === undefined ? <p className="muted">Load your cats to check current ownership on chain, including transfers.</p> : <ul className="cat-list">{cats.map(cat => <li key={cat.id.toString()}><span className="token-glyph" aria-hidden="true">#</span><div><h3>Swarm Cat #{cat.id.toString()}</h3>{safeUri(cat.uri) ? <a href={safeUri(cat.uri)} target="_blank" rel="noreferrer">View token metadata ↗</a> : <p className="small muted">Metadata is not configured yet.</p>}</div></li>)}</ul>}
          <div className="scan-controls"><button type="button" className="button" onClick={() => void loadCats()} disabled={!verified || !state || scanning}>{scanning ? 'Checking ownership…' : 'Load my cats'}</button>{scanning && <button className="button" type="button" onClick={() => { scanController.current?.abort(); setScanning(false); }}>Cancel lookup</button>}</div>
          <p className="small" role="status">{scanning ? `Checked ${scanned.toLocaleString()} token IDs. Larger collections take longer.` : scanError}</p>
          {state && <CollectionTools r={r} client={client} s={state} wallet={wallet} tx={tx} ready={ready}/>}
        </>}
      </section>
      <section className="section about-section"><div><h2>A collection, made together.</h2><p>Each cat belongs to a 10,000-piece collection drawn by the IMD swarm. Art and metadata are published by the owner.</p></div><dl><div><dt>Protocol fee split</dt><dd>40% creator · 40% platform · 20% reserve</dd></div><div><dt>Secondary royalties</dt><dd>5% to the creator, reported through ERC-2981</dd></div><div><dt>Metadata</dt><dd>{state ? state.baseURI ? state.metadataFrozen ? 'Published and frozen' : 'Published; owner can update' : 'Awaiting publication' : 'Checking…'}</dd></div><div><dt>Transfers</dt><dd>No protocol fee, tax or limit</dd></div></dl></section>
      <details className="trade-disclosure" onToggle={e => setTradeOpen(e.currentTarget.open)}><summary>Trade the Loom launch token <span aria-hidden="true">↗</span></summary>{tradeOpen && <TradePanel r={r} client={client} wallet={wallet} tx={tx} ready={ready} s={state}/>}</details>
      {state && <OwnerPanel r={r} s={state} tx={tx} wallet={wallet} ready={ready}/>}
      <details className="deployment-details"><summary>Contracts & collection details</summary><p className="muted">Deployment interfaces are checked against their attested hashes. All transactions use this site's deployment configuration.</p>{r.deployment.contracts.map(c => <div className="contract-row" key={c.name}><h3>{c.name}</h3><AddressView runtime={r} address={c.address} label={c.name}/></div>)}
        {state && <><h3>Collection owner</h3><AddressView runtime={r} address={state.owner} label="owner"/><div className="fee-recipients">{(['CREATOR', 'PLATFORM', 'RESERVE'] as const).map((key, i) => <div key={key}><h3>{['Creator · 40%', 'Platform · 40%', 'Reserve · 20%'][i]}</h3><AddressView runtime={r} address={state[key]} label={key.toLowerCase()}/></div>)}</div><p>Provenance: {state.provenanceSet ? 'Committed' : 'Not set'} · Reveal seed: {state.revealed ? 'Recorded' : 'Not recorded'} · Metadata: {state.metadataFrozen ? 'Frozen' : 'Editable'}</p><p className="small break">Base URI: {state.baseURI || 'Not set'}<br/>Unrevealed URI: {state.unrevealedURI || 'Not set'}</p></>}
        <p className="small break">Deployed source: <code>{r.deployment.sourceCommit}</code></p><a href="./imd-deployment.json" target="_blank" rel="noreferrer">View deployment manifest ↗</a><p className="small muted">USD pricing is unavailable. No fiat price feed is configured.</p>{r.deployment.network.faucets.length > 0 && <a href={r.deployment.network.faucets[0]} target="_blank" rel="noreferrer">Get Sepolia test ETH ↗</a>}
      </details>
    </main>
    <footer><a className="wordmark" href="#mint"><Icon name="mark"/><span>Swarm Cats</span></a><span className="small">A testnet collection by the IMD swarm.</span><a href="#mint">Back to mint ↑</a></footer>
  </>;
}
