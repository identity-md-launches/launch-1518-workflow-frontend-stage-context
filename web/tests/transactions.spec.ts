import { test, expect } from '@playwright/test';
import { mockChain, deployment } from './mock-chain';
test('pending mint prevents duplicates until receipt arrives', async ({ page }) => {
  const m = await mockChain(page);
  let release = false;
  // Wrap the fixture's receipt calls while leaving its real ABI-decoded responses intact.
  await page.addInitScript(() => {
    const w = window as any;
    const original = w.ethereum.request;
    w.__holdSignature = false;
    w.ethereum.request = async (request: any) => {
      if (request.method === 'eth_sendTransaction') {
        const hash = await original(request);
        w.__submitted = true;
        return hash;
      }
      return original(request);
    };
  });
  for (const url of deployment.network.rpcUrls) await page.route(url + '**', async route => {
    const payload = route.request().postDataJSON();
    const one = Array.isArray(payload) && payload.length === 1 ? payload[0] : payload;
    if (!release && one.method === 'eth_getTransactionReceipt') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(payload) ? [{ jsonrpc: '2.0', id: one.id, result: null }] : { jsonrpc: '2.0', id: one.id, result: null }) });
    } else await route.fallback();
  });
  await page.goto('./'); await expect(page.getByText(/Live at block/)).toBeVisible();
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Mint 1 cat', exact: true }).click();
  await expect(page.getByText(/Mint 1 cat submitted/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Waiting for confirmation…', exact: true })).toBeDisabled();
  expect(m.writes).toHaveLength(1);
  release = true;
  await expect(page.getByText('Mint 1 cat confirmed.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1);
});
test('ABI tampering fails bootstrap before connection or transactions', async ({ page }) => {
  await page.route('**/abi/SwarmCats.json', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('interface hash does not match');
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toHaveCount(0);
});
test('primary mint completes using keyboard controls', async ({ page }) => {
  const m = await mockChain(page);
  await page.goto('./'); await expect(page.getByText(/Live at block/)).toBeVisible();
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Mint 1 cat', exact: true })).toBeEnabled();
  await page.getByLabel('Quantity', { exact: true }).focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Mint 2 cats', exact: true }).focus();
  expect(await page.locator(':focus-visible').count()).toBe(1);
  await page.keyboard.press('Enter'); await expect(page.getByText('Mint 2 cats confirmed.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1);
});
test('confirmation timeout keeps the lock and recheck recovers without a duplicate', async ({ page }) => {
  await page.clock.install();
  const m = await mockChain(page);
  let release = false;
  for (const url of deployment.network.rpcUrls) await page.route(url + '**', async route => {
    const payload = route.request().postDataJSON();
    const one = Array.isArray(payload) && payload.length === 1 ? payload[0] : payload;
    if (!release && one.method === 'eth_getTransactionReceipt') {
      const response = { jsonrpc: '2.0', id: one.id, result: null };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(payload) ? [response] : response) });
    } else await route.fallback();
  });
  await page.goto('./'); await expect(page.getByText(/Live at block/)).toBeVisible();
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Mint 1 cat', exact: true }).click();
  await expect(page.getByText(/Mint 1 cat submitted/)).toBeVisible();
  await page.clock.fastForward(181_000);
  await expect(page.getByRole('button', { name: 'Check confirmation', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Waiting for confirmation…', exact: true })).toBeDisabled();
  expect(m.writes).toHaveLength(1);
  release = true;
  await page.getByRole('button', { name: 'Check confirmation', exact: true }).click();
  await expect(page.getByText('Mint 1 cat confirmed.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1);
});
