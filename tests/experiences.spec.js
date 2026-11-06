import { test, expect } from './fixtures.js';
import { openApp } from './helpers.js';

test('particle drawing follows pointer input and clears', async ({ page }) => {
  await openApp(page);
  await page.click('#catalogToggle');
  await page.getByRole('button', { name: 'Particle draw' }).click();
  const canvas = page.locator('.draw-surface canvas'), box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.liveIt.app.experiences.drawPoints.length)).toBeGreaterThan(5);
  await page.getByRole('button', { name: 'Clear' }).click();
  expect(await page.evaluate(() => window.liveIt.app.experiences.drawPoints.length)).toBe(0);
});

test('gesture keyboard inserts text and supports editing', async ({ page }) => {
  await openApp(page);
  await page.click('#catalogToggle');
  await page.getByRole('button', { name: 'Gesture keyboard' }).click();
  await expect(page.locator('.virtual-keyboard .virtual-key')).toHaveCount(50);
  await page.locator('.virtual-key[data-key="h"]').click();
  await page.locator('.virtual-key[data-key="i"]').click();
  await expect(page.getByLabel('Typed text')).toHaveValue('hi');
  await page.locator('.virtual-key[data-key="Backspace"]').click();
  await expect(page.getByLabel('Typed text')).toHaveValue('h');
});

test('games provide Snake, legal chess and a matching card board', async ({ page }) => {
  await openApp(page);
  await page.click('#catalogToggle');
  await page.getByRole('button', { name: 'Games' }).click();
  await page.locator('[data-game="snake"]').click();
  await expect(page.locator('.snake-cell')).toHaveCount(280);
  await page.locator('[data-action="snake-start"]').click();
  await page.keyboard.press('ArrowUp');

  await page.locator('[data-game="chess"]').click();
  await expect(page.locator('.chess-square')).toHaveCount(64);
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.chess-status')).toContainText('Black to move');

  await page.locator('[data-game="memory"]').click();
  await expect(page.locator('.memory-card')).toHaveCount(16);
});