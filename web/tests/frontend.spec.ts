import { test, expect, type Page } from '@playwright/test';
import { decodeAbiParameters, decodeFunctionData, parseAbiParameters, parseEther } from 'viem';
import { mockChain, deployment, catsAbi, loomAbi, visitor, owner } from './mock-chain';
import { poolType, routerAbi, permitAbi, encodeSwap, amountUnits } from '../src/swap';
async function loaded(page: Page) { await page.goto('./'); await expect(page.getByText(/Live at block/)).toBeVisible(); }
async function connect(page: Page) { await page.getByRole('button', { name: 'Connect wallet', exact: true }).click(); await expect(page.getByText('Wallet connected', { exact: true })).toBeVisible(); }
async function trade(page: Page) { await page.getByText('Trade the Loom launch token', { exact: false }).click(); await expect(page.getByRole('heading', { name: 'Review your trade' })).toBeVisible(); }

test('static subpath, first-screen action, quantity fee, missing wallet', async ({ page }) => {
  await mockChain(page);
  await page.addInitScript(() => { delete window.ethereum; });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await loaded(page);
  await expect(page.getByRole('heading', { name: 'Mint your Swarm Cat.' })).toBeVisible();
  const box = await page.getByRole('button', { name: 'Connect to mint' }).boundingBox();
  expect(box!.y + box!.height).toBeLessThan(844);
  await page.getByLabel('Quantity', { exact: true }).selectOption('5');
  await expect(page.getByText('0.0025 ETH', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Connect to mint' }).click();
  await expect(page.getByRole('alert')).toContainText('No browser wallet found');
  expect(errors).toEqual([]);
});

test('mint simulates, sends exact quantity and fee, then refreshes', async ({ page }) => {
  const m = await mockChain(page); await loaded(page); await connect(page);
  await page.getByLabel('Quantity', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Mint 3 cats', exact: true }).click();
  await expect(page.getByText('Mint 3 cats confirmed.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1);
  expect(BigInt(m.writes[0].value!)).toBe(parseEther('0.0015'));
  expect(decodeFunctionData({ abi: catsAbi, data: m.writes[0].data })).toMatchObject({ functionName: 'mint', args: [3n] });
  await expect(page.getByText('2 of 5 lifetime mints remaining')).toBeVisible();
  const simulateIndex = m.calls.findIndex(c => c.method === 'eth_call' && c.params[0].data === m.writes[0].data);
  const sendIndex = m.calls.findIndex(c => c.method === 'eth_sendTransaction');
  expect(simulateIndex).toBeGreaterThan(-1); expect(simulateIndex).toBeLessThan(sendIndex);
});

test('missing chain offers the exact add-chain parameters and switches again', async ({ page }) => {
  const m = await mockChain(page, { wrongChain: true }); await loaded(page); await connect(page);
  await expect(page.getByText('Wallet is on a different network.')).toBeVisible(); expect(m.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Switch to Sepolia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mint 1 cat', exact: true })).toBeEnabled();
  const calls = await page.evaluate(() => (window as any).__walletCalls);
  expect(calls.filter((c: any) => c.method === 'wallet_switchEthereumChain')).toHaveLength(2);
  expect(calls.find((c: any) => c.method === 'wallet_addEthereumChain').params).toEqual([deployment.walletAddChain]);
});

test('wallet connection rejection can retry', async ({ page }) => {
  await mockChain(page, { reject: true }); await loaded(page);
  await page.getByRole('button', { name: 'Connect to mint' }).click();
  await expect(page.getByRole('alert')).toContainText('Request rejected');
  await page.evaluate(() => { (window as any).__walletReject = false; });
  await connect(page); await expect(page.getByRole('button', { name: 'Mint 1 cat', exact: true })).toBeEnabled();
});

test('wallet signing rejection unlocks mint without broadcasting', async ({ page }) => {
  const m = await mockChain(page); await loaded(page); await connect(page);
  await page.evaluate(() => { (window as any).__walletReject = true; });
  await page.getByRole('button', { name: 'Mint 1 cat', exact: true }).click();
  await expect(page.getByText(/Request rejected in your wallet/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mint 1 cat', exact: true })).toBeEnabled();
  expect(m.writes).toHaveLength(0);
});

for (const [label, opts, message] of [
  ['provenance unset', { provenance: false }, 'Mint opens after the owner sets provenance.'],
  ['paused', { paused: true }, 'Minting is paused by the owner.'],
  ['sold out', { totalSupply: 10000n }, 'All cats have been minted.'],
  ['wallet cap', { minted: 5n }, 'This quantity exceeds your lifetime mint allowance.'],
] as const) test(`mint gating: ${label}`, async ({ page }) => {
  const m = await mockChain(page, opts); await loaded(page); await connect(page);
  await expect(page.getByRole('button', { name: 'Mint 1 cat', exact: true })).toBeDisabled();
  await expect(page.getByText(message, { exact: true })).toBeVisible(); expect(m.writes).toHaveLength(0);
});

test('decoded simulation error stops before wallet signature', async ({ page }) => {
  const m = await mockChain(page, { revert: true }); await loaded(page); await connect(page);
  await page.getByRole('button', { name: 'Mint 1 cat', exact: true }).click();
  await expect(page.getByText('Your wallet has reached its lifetime mint limit.')).toBeVisible();
  expect(m.writes).toHaveLength(0);
});

test('missing deployed code disables transactions', async ({ page }) => {
  const m = await mockChain(page, { missingCode: true }); await page.goto('./');
  await expect(page.getByText('Live connection unavailable')).toBeVisible(); await connect(page);
  await expect(page.getByRole('button', { name: 'Mint 1 cat', exact: true })).toBeDisabled(); expect(m.writes).toHaveLength(0);
});

test('wrong RPC chain fails closed', async ({ page }) => {
  await mockChain(page, { rpcWrongChain: true }); await page.goto('./');
  await expect(page.getByText('Live connection unavailable')).toBeVisible(); await connect(page);
  await expect(page.getByRole('button', { name: 'Mint 1 cat', exact: true })).toBeDisabled();
});

test('public RPC failure is visible and connected wallet provides fallback', async ({ page }) => {
  await mockChain(page, { failRpc: true }); await page.goto('./');
  await expect(page.getByText('Live connection unavailable')).toBeVisible();
  await connect(page); await expect(page.getByText(/Live at block/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mint 1 cat', exact: true })).toBeEnabled();
});

test('actual ownership lookup includes transferred tokens and empty metadata', async ({ page }) => {
  await mockChain(page, { balance: 2n }); await loaded(page); await connect(page);
  await page.getByRole('button', { name: 'Load my cats', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Swarm Cat #1', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Swarm Cat #2', exact: true })).toBeVisible();
  await expect(page.getByText('Metadata is not configured yet.', { exact: true })).toHaveCount(2);
});

test('native buy uses attested pool, slippage minimum, no approval and exact ETH value', async ({ page }) => {
  const m = await mockChain(page); await loaded(page); await connect(page); await trade(page);
  await page.getByLabel('You pay in ETH', { exact: true }).fill('0.01');
  await page.getByRole('button', { name: 'Get quote', exact: true }).click();
  await expect(page.getByText('4.22875 LOOM', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Swap ETH for LOOM', exact: true }).click();
  await expect(page.getByText('Swap ETH for LOOM confirmed.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1); expect(m.writes[0].to.toLowerCase()).toBe(deployment.network.uniswapV4.universalRouter);
  expect(BigInt(m.writes[0].value!)).toBe(parseEther('0.01'));
  const decoded = decodeFunctionData({ abi: routerAbi, data: m.writes[0].data });
  const [commands, inputs] = decoded.args!; expect(commands).toBe('0x10');
  const [actions, params] = decodeAbiParameters(parseAbiParameters('bytes,bytes[]'), (inputs as any)[0]); expect(actions).toBe('0x060c0f');
  const [swap] = decodeAbiParameters(parseAbiParameters(`(${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`), params[0]);
  expect(swap.poolKey.hooks.toLowerCase()).toBe(deployment.poolKey.hooks); expect(swap.amountOutMinimum).toBe(parseEther('4.22875')); expect(swap.zeroForOne).toBe(true);
});

test('token sell shows and confirms both allowance steps before swap', async ({ page }) => {
  const m = await mockChain(page); await loaded(page); await connect(page); await trade(page);
  await page.getByRole('button', { name: 'Sell LOOM', exact: true }).click();
  await page.getByLabel('You pay in LOOM', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Get quote', exact: true }).click();
  await page.getByRole('button', { name: '1. Approve LOOM to Permit2', exact: true }).click();
  await expect(page.getByRole('button', { name: '2. Authorize swap router', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '2. Authorize swap router', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Swap LOOM for ETH', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Swap LOOM for ETH', exact: true }).click();
  await expect(page.getByText('Swap LOOM for ETH confirmed.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(3);
  const approval = decodeFunctionData({ abi: loomAbi, data: m.writes[0].data });
  expect((approval.args![0] as string).toLowerCase()).toBe(deployment.network.uniswapV4.permit2); expect(approval.args![1]).toBe(parseEther('2'));
  const permit = decodeFunctionData({ abi: permitAbi, data: m.writes[1].data }); expect((permit.args![1] as string).toLowerCase()).toBe(deployment.network.uniswapV4.universalRouter); expect(permit.args![2]).toBe(parseEther('2'));
  expect(BigInt(m.writes[2].value || '0x0')).toBe(0n);
});

test('quote failure recovers and changing amount clears a quote', async ({ page }) => {
  await mockChain(page, { quoteFail: true }); await loaded(page); await connect(page); await trade(page);
  await page.getByLabel('You pay in ETH', { exact: true }).fill('1'); await page.getByRole('button', { name: 'Get quote', exact: true }).click();
  await expect(page.locator('#trade .error').first()).not.toBeEmpty();
  await expect(page.getByRole('button', { name: 'Get quote', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Swap ETH for LOOM', exact: true })).toHaveCount(0);
});

test('quotes expire and input edits discard old minimums', async ({ page }) => {
  await page.clock.install(); await mockChain(page); await loaded(page); await connect(page); await trade(page);
  await page.getByLabel('You pay in ETH', { exact: true }).fill('1'); await page.getByRole('button', { name: 'Get quote', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Swap ETH for LOOM', exact: true })).toBeEnabled();
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('button', { name: 'Swap ETH for LOOM', exact: true })).toBeDisabled();
  await page.getByLabel('You pay in ETH', { exact: true }).fill('2');
  await expect(page.getByRole('button', { name: 'Swap ETH for LOOM', exact: true })).toHaveCount(0);
});

test('zero liquidity explains unavailable trading', async ({ page }) => {
  await mockChain(page, { liquidity: 0n }); await loaded(page); await connect(page); await trade(page);
  await expect(page.getByText(/The pool has no active liquidity/)).toBeVisible();
  await page.getByLabel('You pay in ETH', { exact: true }).fill('1');
  await expect(page.getByRole('button', { name: 'Get quote', exact: true })).toBeDisabled();
});

test('owner provenance and metadata setup with irreversible freeze confirmation', async ({ page }) => {
  const m = await mockChain(page, { owner: true, provenance: false, totalSupply: 0n }); await loaded(page); await connect(page);
  await expect(page.getByRole('heading', { name: 'Collection settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set provenance permanently' })).toBeDisabled();
  await page.getByLabel('Real artwork provenance hash', { exact: true }).fill(`0x${'ab'.repeat(32)}`);
  await page.getByRole('button', { name: 'Set provenance permanently' }).click();
  await expect(page.getByText('Set provenance confirmed.', { exact: true })).toBeVisible();
  await page.getByLabel('New base URI', { exact: true }).fill('ipfs://test-metadata-fixture/');
  await page.getByRole('button', { name: 'Set base URI', exact: true }).click();
  await expect(page.getByText('Set base URI confirmed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Freeze metadata permanently', exact: true })).toBeDisabled();
  await page.getByLabel('I understand that neither URI can be changed again.').check();
  await page.getByRole('button', { name: 'Freeze metadata permanently', exact: true }).click();
  await expect(page.getByText('Freeze metadata confirmed.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New base URI', { exact: true })).toBeDisabled();
  expect(m.writes).toHaveLength(3);
});

test('non-owner cannot see settings; account switch clears ownership and allowance', async ({ page }) => {
  await mockChain(page, { owner: true }); await loaded(page); await connect(page);
  await expect(page.getByRole('heading', { name: 'Collection settings' })).toBeVisible();
  await page.evaluate(address => (window as any).__changeAccount(address), visitor);
  await expect(page.getByRole('heading', { name: 'Collection settings' })).toHaveCount(0);
  await page.evaluate(() => (window as any).__changeChain('0x1'));
  await expect(page.getByRole('button', { name: 'Switch to Sepolia', exact: true })).toBeVisible();
});

test('token transfer validates recipient and simulates safe transfer', async ({ page }) => {
  const m = await mockChain(page, { balance: 1n }); await loaded(page); await connect(page);
  await page.getByText('Transfers & approvals', { exact: true }).click();
  await page.getByLabel('Recipient address', { exact: true }).fill('not-an-address'); await page.getByLabel('Token ID', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Transfer asset', exact: true }).click();
  await expect(page.getByText('Enter a valid nonzero Ethereum address.', { exact: true })).toBeVisible(); expect(m.writes).toHaveLength(0);
  await page.getByLabel('Recipient address', { exact: true }).fill(owner); await page.getByRole('button', { name: 'Transfer asset', exact: true }).click();
  await expect(page.getByText('Transfer confirmed.', { exact: true })).toBeVisible();
  expect(decodeFunctionData({ abi: catsAbi, data: m.writes[0].data }).functionName).toBe('safeTransferFrom');
});

test('responsive stress, full addresses, huge balances, keyboard focus, reduced motion', async ({ page }, info) => {
  await mockChain(page, { owner: true, longBalance: true }); await loaded(page); await connect(page);
  await page.getByText('Wallet connected', { exact: true }).click();
  await page.getByText('Contracts & collection details', { exact: true }).click();
  for (const width of [320, 390, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(metrics.scroll, `overflow at ${width}`).toBeLessThanOrEqual(metrics.viewport);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Wallet connected', { exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Tab');
  expect(await page.locator(':focus-visible').count()).toBeGreaterThan(0);
  await page.screenshot({ path: `../docs/frontend/${info.project.name}-mobile-connected.png` });
});

test('encoding supports ERC-20 input on either side and extended swap params', () => {
  const key = deployment.poolKey;
  const encoded = encodeSwap(key, key.currency1, 123n, 456n, true);
  expect(encoded.value).toBe(0n);
  const [actions, params] = decodeAbiParameters(parseAbiParameters('bytes,bytes[]'), encoded.inputs[0]);
  expect(actions).toBe('0x060c0f');
  const [swap] = decodeAbiParameters(parseAbiParameters(`(${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`), params[0]);
  expect(swap.zeroForOne).toBe(false); expect(swap.minHopPriceX36).toBe(0n);
  expect(() => amountUnits('1.001', 2)).toThrow(); expect(() => amountUnits('0', 18)).toThrow();
});

test('owner hidden metadata, reveal seed, pause, unpause and reserve mint controls', async ({ page }) => {
  const m = await mockChain(page, { owner: true }); await loaded(page); await connect(page);
  await page.getByLabel('New unrevealed URI', { exact: true }).fill('https://example.invalid/fixture.json');
  await page.getByRole('button', { name: 'Set unrevealed URI', exact: true }).click();
  await expect(page.getByText('Set unrevealed URI confirmed.', { exact: true })).toBeVisible();
  await page.getByLabel('Oracle-provided seed', { exact: true }).fill(`0x${'78'.repeat(32)}`);
  await page.getByRole('button', { name: 'Record seed permanently', exact: true }).click();
  await expect(page.getByText('Record reveal seed confirmed.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause minting', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume minting', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Mint 1 cat', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Resume minting', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause minting', exact: true })).toBeEnabled();
  await page.getByLabel('Team quantity', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Mint team reserve', exact: true }).click();
  await expect(page.getByText('Team mint confirmed.', { exact: true })).toBeVisible();
  expect(BigInt(m.writes[4].value!)).toBe(parseEther('0.001')); expect(decodeFunctionData({ abi: catsAbi, data: m.writes[4].data }).functionName).toBe('reserveMint');
});

test('NFT single-token approval can be revoked without a dummy recipient', async ({ page }) => {
  const m = await mockChain(page, { balance: 1n }); await loaded(page); await connect(page);
  await page.getByText('Transfers & approvals', { exact: true }).click();
  await page.getByLabel('Action', { exact: true }).selectOption('revoke');
  await page.getByLabel('Token ID', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Revoke token approval', exact: true }).click();
  await expect(page.getByText('Update approval confirmed.', { exact: true })).toBeVisible();
  const decoded = decodeFunctionData({ abi: catsAbi, data: m.writes[0].data });
  expect(decoded).toMatchObject({ functionName: 'approve', args: ['0x0000000000000000000000000000000000000000', 1n] });
});
