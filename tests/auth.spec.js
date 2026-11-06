import { test, expect } from '@playwright/test';

test('the studio stays private until a valid sign-in and closes on logout', async ({ request, baseURL }) => {
  const home = await request.get(baseURL);
  expect(home.status()).toBe(200);
  expect(await home.text()).toContain('Welcome back.');
  expect((await request.get(new URL('/src/app.js', baseURL).toString())).status()).toBe(401);
  expect((await request.post(new URL('/api/ai', baseURL).toString(), { data: { messages: [{ role: 'user', content: 'hello' }] } })).status()).toBe(401);

  const rejected = await request.post(new URL('/api/login', baseURL).toString(), {
    form: { username: 'liveit-test', password: 'incorrect' },
  });
  expect(rejected.status()).toBe(401);

  const accepted = await request.post(new URL('/api/login', baseURL).toString(), {
    form: { username: 'liveit-test', password: 'local-test-password' },
  });
  expect(accepted.status()).toBe(200);
  expect((await request.get(new URL('/src/app.js', baseURL).toString())).status()).toBe(200);
  expect((await request.get(new URL('/node_modules/chess.js/dist/esm/chess.js', baseURL).toString())).status()).toBe(200);
  expect((await request.post(new URL('/api/logout', baseURL).toString())).status()).toBe(200);
  expect((await request.get(new URL('/src/app.js', baseURL).toString())).status()).toBe(401);
});

test('login and model navigation adapt from desktop to mobile', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/?n=5000', baseURL).toString());
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.screenshot({ path: '/tmp/liveit-login-desktop.png' });
  await page.getByLabel('Account').fill('liveit-test');
  await page.getByLabel('Password').fill('local-test-password');
  await page.getByRole('button', { name: /Enter the studio/ }).click();
  await page.waitForFunction(() => window.liveIt);
  await page.getByRole('button', { name: 'Continue without camera' }).click();
  await page.click('#panelToggle');
  await expect(page.locator('#panel')).toBeVisible();
  await page.waitForTimeout(3100);
  await expect(page.locator('#panel')).toBeHidden();

  const tabs = page.locator('#catTabs');
  await expect.poll(() => tabs.evaluate((element) => getComputedStyle(element).flexDirection)).toBe('column');
  await page.click('#catalogToggle');
  await expect(page.locator('#catalog')).toBeVisible();
  await page.getByRole('tab', { name: /Engines/ }).click();
  await expect(page.getByRole('tab', { name: /Engines/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Inline-4 Engine' }).click();
  await expect(page.locator('#catalog')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.liveIt.status().name)).toBe('Inline-4 Engine');

  await page.click('#toolsToggle');
  await expect(page.locator('#toolsDrawer')).toBeVisible();
  await page.click('#bLabels');
  await page.waitForTimeout(3100);
  await expect(page.locator('#toolsDrawer')).toBeHidden();
  await page.screenshot({ path: '/tmp/liveit-studio-desktop.png' });

  await page.getByRole('button', { name: /Sign out/ }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/liveit-login-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});