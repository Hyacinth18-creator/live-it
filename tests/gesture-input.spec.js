import { test, expect } from './fixtures.js';
import { openApp } from './helpers.js';

test('drawing emits animated particles at each extended fingertip', async ({ page }) => {
  await openApp(page);
  await page.click('#catalogToggle');
  await page.getByRole('button', { name: 'Particle draw' }).click();
  await page.evaluate(async () => window.liveIt.advance(0.1, window.liveIt.synth({ pose: 'open' })));
  const particles = await page.evaluate(() => window.liveIt.app.experiences.drawPoints);
  expect(particles.length).toBeGreaterThanOrEqual(35);
  expect(particles[0]).toEqual(expect.objectContaining({ phase: expect.any(Number), drift: expect.any(Number) }));
});

test('keyboard uses detected finger counts and presses a steady key after 3 seconds', async ({ page }) => {
  await openApp(page);
  await page.click('#catalogToggle');
  await page.getByRole('button', { name: 'Gesture keyboard' }).click();

  const fingerCounts = await page.evaluate(() => {
    const app = window.liveIt.app, t = app.t, W = window.liveIt;
    const hand = (pose) => W.synth({ pose, cx: 0.5, cy: 0.5 });
    app.ctl.onHands([hand('three')], t); app.experiences.update(app.ctl);
    const three = app.experiences.root.querySelector('.keyboard-finger-count').textContent;
    app.ctl.onHands([hand('open')], t); app.experiences.update(app.ctl);
    const five = app.experiences.root.querySelector('.keyboard-finger-count').textContent;
    app.ctl.onHands([hand('open'), hand('open')], t); app.experiences.update(app.ctl);
    const ten = app.experiences.root.querySelector('.keyboard-finger-count').textContent;
    return [three, five, ten];
  });
  expect(fingerCounts).toEqual([
    '3 fingers detected · hold each key steady for 3 seconds',
    '5 fingers detected · hold each key steady for 3 seconds',
    '10 fingers detected · hold each key steady for 3 seconds',
  ]);

  const key = page.locator('.virtual-key[data-key="h"]');
  const box = await key.boundingBox();
  const input = await page.evaluate(async ([x, y]) => {
    const W = window.liveIt, params = W.pointAt(x, y), hand = W.synth({ pose: 'point', ...params });
    await W.advance(2.9, hand);
    const before = document.querySelector('.keyboard-output').value;
    await W.advance(0.2, hand);
    return [before, document.querySelector('.keyboard-output').value];
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(input).toEqual(['', 'h']);
});
