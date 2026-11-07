import { test, expect } from '@playwright/test';

test('the studio and its app assets are public without signing in', async ({ request, baseURL }) => {
  const home = await request.get(baseURL);
  expect(home.status()).toBe(200);
  expect(home.url()).toContain('/login.html');
  expect(await home.text()).toContain('<title>Live It | Private Studio</title>');
  expect(await home.text()).toContain('PUBLIC ACCESS');
  const studio = await request.get(new URL('/studio', baseURL).toString());
  expect(studio.status()).toBe(200);
  expect(studio.url()).toContain('/index.html');
  expect(await studio.text()).toContain('<title>Live It | Studio</title>');
  expect((await request.get(new URL('/src/app.js', baseURL).toString())).status()).toBe(200);
  expect((await request.get(new URL('/vendor/chess.js', baseURL).toString())).status()).toBe(200);
  expect((await request.get(new URL('/vendor/mediapipe/vision_bundle.mjs', baseURL).toString())).status()).toBe(200);
  expect((await request.get(new URL('/vendor/mediapipe/wasm/vision_wasm_internal.wasm', baseURL).toString())).status()).toBe(200);
  const ai = await request.post(new URL('/api/ai', baseURL).toString(), {
    data: { messages: [{ role: 'user', content: 'hello' }] },
  });
  expect(ai.status()).not.toBe(401);

  const signInPage = await request.get(new URL('/login', baseURL).toString());
  expect(signInPage.url()).toContain('/login.html');
  expect(await signInPage.text()).toContain('Sign-in is disabled');
  expect(await signInPage.text()).toContain('Welcome back.');
  expect(await signInPage.text()).toContain('name="username"');
  expect(await signInPage.text()).toContain('name="password"');
  expect(await signInPage.text()).toContain('id="signIn" class="access-submit" type="submit" disabled');
  const signOutPage = await request.get(new URL('/logout', baseURL).toString());
  expect(signOutPage.url()).toContain('/logout.html');
  expect(await signOutPage.text()).toContain('There is no session to end');
  expect(await signOutPage.text()).not.toContain('<form');
});

test('the studio and model navigation adapt from desktop to mobile', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/studio?n=5000', baseURL).toString());
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/liveit-studio-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});