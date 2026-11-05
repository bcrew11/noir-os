import os from 'node:os';
import { expect, test } from '@playwright/test';

const TV = process.env.NOIR_E2E_TV ?? 'http://localhost:5173';
// The phone must look like a *remote* device, so use the LAN address rather than localhost.
const lanIp = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address;
const PHONE = process.env.NOIR_E2E_PHONE ?? `http://${lanIp}:5174/phone/`;

const focused = (page: import('@playwright/test').Page) => page.locator('[data-focused]').first();

test('home opens with YouTube TV focused and the five primary apps in order', async ({ page }) => {
  await page.goto(TV);
  await expect(page.locator('[data-app="youtube-tv"]')).toHaveAttribute('data-focused', 'true');
  const order = await page.locator('main [data-app]').evaluateAll((els) => els.map((e) => e.getAttribute('data-app')));
  expect(order.slice(0, 5)).toEqual(['youtube-tv', 'youtube', 'espn', 'netflix', 'disney-plus']);
  await expect(page.getByText(/Demo · simulated/)).toBeVisible();
});

test('remote navigation moves focus spatially and Back returns home', async ({ page }) => {
  await page.goto(TV);
  await expect(page.locator('[data-app="youtube-tv"]')).toHaveAttribute('data-focused', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-app="youtube"]')).toHaveAttribute('data-focused', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(focused(page)).toHaveText(/Home|Apps|Music/);
  // go to Inputs via nav bar
  await page.click('nav >> text=Inputs');
  await expect(page.getByRole('heading', { name: 'Inputs' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-app="youtube-tv"]')).toBeVisible();
});

test('launching an app in demo mode is labelled as simulated, never as success', async ({ page }) => {
  await page.goto(TV);
  await expect(page.locator('[data-app="youtube-tv"]')).toHaveAttribute('data-focused', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/launch simulated \(demo\)/i)).toBeVisible();
});

test('phone pairs with a code shown on the TV, then drives the dashboard', async ({ browser }) => {
  test.skip(!lanIp, 'needs a LAN interface');
  const tv = await browser.newPage();
  await tv.goto(TV);
  await expect(tv.locator('[data-app="youtube-tv"]')).toHaveAttribute('data-focused', 'true');

  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  await phone.goto(PHONE);
  await phone.getByRole('button', { name: 'Show code on TV' }).click();

  const dialog = tv.getByRole('dialog');
  await expect(dialog).toContainText('Enter this code on your phone');
  const code = (await dialog.locator('span.tabular-nums').allTextContents()).join('');
  expect(code).toMatch(/^\d{6}$/);

  // A wrong code is rejected.
  await phone.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000');
  await phone.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(phone.getByText(/doesn’t match/)).toBeVisible();

  await phone.getByLabel('6-digit code').fill(code);
  await phone.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(phone.getByRole('button', { name: 'OK' })).toBeVisible();
  await expect(dialog).toBeHidden();

  // Phone D-pad → dashboard focus
  await phone.getByRole('button', { name: 'right' }).click();
  await expect(tv.locator('[data-app="youtube"]')).toHaveAttribute('data-focused', 'true');

  // Settings changed on the phone sync to the TV immediately.
  await phone.getByRole('button', { name: 'Customize' }).click();
  await phone.getByRole('button', { name: 'Rose', exact: true }).click();
  await expect.poll(() => tv.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--noir-primary').trim().toLowerCase())).toBe('#e11d74');
  await phone.getByRole('button', { name: 'Violet', exact: true }).click();
  await expect.poll(() => tv.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--noir-primary').trim().toLowerCase())).toBe('#8b5cf6');
  await phoneCtx.close();
});

test('unpaired remote devices are rejected by the API', async ({ request }) => {
  test.skip(!lanIp, 'needs a LAN interface');
  const res = await request.get(`http://${lanIp}:5174/api/state`);
  expect(res.status()).toBe(401);
});
