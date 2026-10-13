import { useEffect, useRef, useState } from 'react';
import { formatUnits, zeroAddress } from 'viem';
import { errorMessage, type Collection } from './chain';
import { type Client, type Runtime } from './config';
import { ActionButton, TxFeedback } from './components';
import { allowances, amountUnits, encodeSwap, currencyAbi, permitAbi, quoterAbi, readMarket, routerAbi, type Market } from './swap';
import type { Transactions, Wallet } from './wallet';
type Quote = { amountIn: bigint; amountOut: bigint; minimum: bigint; at: number; balance: bigint; inputKey: string };
export function TradePanel({ r, client, wallet, tx, ready, s }: { r: Runtime; client: Client; wallet: Wallet; tx: Transactions; ready: boolean; s?: Collection }) {
  const [market, setMarket] = useState<Market>();
  const [marketError, setMarketError] = useState('');
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(50);
  const [quote, setQuote] = useState<Quote>();
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [step, setStep] = useState<'token' | 'permit' | 'ready' | 'checking'>('checking');
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const quoteLock = useRef(false);
  const input = direction === 'buy' ? market?.pair : market?.token;
  const output = direction === 'buy' ? market?.token : market?.pair;
  const inputKey = `${amount}:${direction}:${slippage}:${wallet.account}:${wallet.chainId}`;
  const currentKey = useRef(inputKey); currentKey.current = inputKey;
  const u = r.deployment.network.uniswapV4;
  const load = async () => {
    setMarketError(''); setMarket(undefined);
    try { setMarket(await readMarket(r, client)); } catch (e) { setMarketError(errorMessage(e)); }
  };
  useEffect(() => { void load(); }, [r, client]); // The provider changes invalidate the market.
  useEffect(() => { generation.current++; setQuote(undefined); setQuoteError(''); setStep('checking'); }, [inputKey]);
  useEffect(() => { if (!quote) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [quote]);
  const expired = !!quote && (now - quote.at >= 60_000 || quote.inputKey !== inputKey);
  const getQuote = async () => {
    if (!input || !output || !wallet.account || !u || !r.deployment.poolKey || quoteLock.current) return;
    quoteLock.current = true; setQuoting(true); setQuoteError(''); setQuote(undefined);
    const g = ++generation.current;
    const key = inputKey;
    try {
      const amountIn = amountUnits(amount, input.decimals);
      const [result, balance] = await Promise.all([
        client.simulateContract({ address: u.quoter, abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ poolKey: r.deployment.poolKey, zeroForOne: input.address.toLowerCase() === r.deployment.poolKey.currency0.toLowerCase(), exactAmount: amountIn, hookData: '0x' }], account: wallet.account }),
        input.address === zeroAddress ? client.getBalance({ address: wallet.account }) : client.readContract({ address: input.address, abi: currencyAbi(r, input.address), functionName: 'balanceOf', args: [wallet.account] }),
      ]);
      const amountOut = result.result[0];
      const minimum = amountOut * BigInt(10_000 - slippage) / 10_000n;
      if (minimum <= 0n || minimum >= 2n ** 128n) throw new Error('The quote is outside supported amount limits. Try another amount.');
      const inputBalance = balance as bigint;
      const next = await allowances(r, client, wallet.account, input.address, amountIn);
      if (g !== generation.current || currentKey.current !== key) return;
      const time = Date.now(); setNow(time); setStep(next);
      setQuote({ amountIn, amountOut, minimum, at: time, balance: inputBalance, inputKey: key });
    } catch (e) { if (g === generation.current) setQuoteError(errorMessage(e)); }
    finally { quoteLock.current = false; setQuoting(false); }
  };
  const approveOrSwap = async () => {
    if (!quote || !input || !output || !u || !wallet.account || !r.deployment.poolKey || expired || step === 'checking') return;
    const key = inputKey;
    const id = step === 'token' ? 'approve-token' : step === 'permit' ? 'approve-permit' : 'swap';
    const label = step === 'token' ? `Approve ${input.symbol} for Permit2` : step === 'permit' ? `Authorize router for ${input.symbol}` : `Swap ${input.symbol} for ${output.symbol}`;
    const confirmed = await tx.send(id, label, async () => {
      if (currentKey.current !== key || Date.now() - quote.at >= 60_000) throw new Error('This quote expired. Get a fresh quote before continuing.');
      const fresh = await allowances(r, client, wallet.account!, input.address, quote.amountIn);
      if (fresh !== step) { setStep(fresh); throw new Error('Allowances changed. Review the next step and retry.'); }
      if (step === 'token') return { address: input.address, abi: currencyAbi(r, input.address), functionName: 'approve', args: [u.permit2, quote.amountIn] };
      const block = await client.getBlock();
      if (step === 'permit') return { address: u.permit2, abi: permitAbi, functionName: 'approve', args: [input.address, u.universalRouter, quote.amountIn, Number(block.timestamp) + 3600] };
      const encoded = encodeSwap(r.deployment.poolKey!, input.address, quote.amountIn, quote.minimum, u.extendedSwapParams);
      return { address: u.universalRouter, abi: routerAbi, functionName: 'execute', args: [encoded.commands, encoded.inputs, block.timestamp + 600n], value: encoded.value };
    });
    if (confirmed && currentKey.current === key) {
      if (step === 'ready') { setQuote(undefined); void load(); }
      else {
        setStep('checking');
        try { setStep(await allowances(r, client, wallet.account, input.address, quote.amountIn)); }
        catch (e) { setQuoteError(errorMessage(e)); setQuote(undefined); }
      }
    }
  };
  return <section className="section" id="trade"><div className="section-heading"><h2>Trade Loom</h2><span className="small">Uniswap v4 · {r.deployment.network.name}</span></div>
    <p className="muted">Loom is the launch token. You do not need it to mint a cat.</p>
    {marketError ? <div className="notice error" role="alert">{marketError}<button type="button" className="button" onClick={() => void load()}>Retry pool check</button></div> : !market ? <p role="status">Checking pool and trading contracts…</p> : <div className="trade-grid">
      <div><div className="segmented" role="group" aria-label="Trade direction"><button type="button" aria-pressed={direction === 'buy'} onClick={() => setDirection('buy')} disabled={!!tx.active}>Buy {market.token.symbol}</button><button type="button" aria-pressed={direction === 'sell'} onClick={() => setDirection('sell')} disabled={!!tx.active}>Sell {market.token.symbol}</button></div>
        <label htmlFor="swap-amount">You pay in {input?.symbol}</label><input id="swap-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} disabled={!!tx.active} autoComplete="off" placeholder="0.00"/>
        <label htmlFor="slippage">Slippage tolerance</label><select id="slippage" value={slippage} onChange={e => setSlippage(Number(e.target.value))} disabled={!!tx.active}><option value="50">0.5%</option><option value="100">1%</option><option value="200">2%</option></select>
        {wallet.account && s && <p className="small break">Wallet: {formatUnits(s.loom, s.loomDecimals)} {s.loomSymbol} · {formatUnits(s.eth, r.deployment.network.nativeCurrency.decimals)} {r.deployment.network.nativeCurrency.symbol}</p>}
        {!market.sqrtPriceX96 ? <p className="notice">The pool is not initialized.</p> : !market.liquidity ? <p className="notice">The pool has no active liquidity. Trading is unavailable until liquidity is added.</p> : null}
        {!wallet.account ? <p className="small muted">Connect your wallet to request a quote.</p> : !wallet.correctChain ? <p className="small muted">Switch to {r.deployment.network.name} using the wallet control above.</p> : null}
        <button type="button" className="button" onClick={() => void getQuote()} disabled={!ready || !market.liquidity || !amount || quoting || !!tx.active}>{quoting ? 'Requesting quote…' : quote ? 'Refresh quote' : 'Get quote'}</button>
        <p className="error" role="alert">{quoteError}</p>
      </div>
      <div className="trade-review"><h3>Review your trade</h3>{quote && input && output ? <><dl><div><dt>Expected output</dt><dd className="break">{formatUnits(quote.amountOut, output.decimals)} {output.symbol}</dd></div><div><dt>Minimum received</dt><dd className="break">{formatUnits(quote.minimum, output.decimals)} {output.symbol}</dd></div><div><dt>Quoted rate</dt><dd className="break">1 {input.symbol} ≈ {Number(formatUnits(quote.amountOut, output.decimals)) / Number(formatUnits(quote.amountIn, input.decimals))} {output.symbol}</dd></div><div><dt>Quote validity</dt><dd>{expired ? 'Expired; refresh quote' : `${Math.max(0, 60 - Math.floor((now - quote.at) / 1000))} seconds`}</dd></div></dl>
        <p className="small muted">Swap deadline: 10 minutes. Gas is additional. {input.address === zeroAddress ? 'No token approval is needed for ETH.' : 'Approve only this input amount. Router permission expires after one hour.'}</p>
        {quote.balance < quote.amountIn && <p className="error">Your {input.symbol} balance is too low for this trade.</p>}
        <ActionButton id={step === 'token' ? 'approve-token' : step === 'permit' ? 'approve-permit' : 'swap'} tx={tx} disabled={!ready || expired || step === 'checking' || quote.balance < quote.amountIn} onClick={() => void approveOrSwap()}>{step === 'token' ? `1. Approve ${input.symbol} to Permit2` : step === 'permit' ? '2. Authorize swap router' : step === 'checking' ? 'Checking allowances…' : `Swap ${input.symbol} for ${output.symbol}`}</ActionButton>
      </> : <p className="muted">Enter an amount to see a live quote, the minimum you will receive and any approval steps.</p>}
        {['approve-token', 'approve-permit', 'swap'].map(id => <TxFeedback key={id} id={id} tx={tx} runtime={r}/>)}
        <p className="small muted">USD context is unavailable. This release uses testnet assets.</p>
      </div>
    </div>}
  </section>;
}
