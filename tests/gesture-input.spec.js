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

test('pinching over an on-screen control activates it', async ({ page }) => {
  await openApp(page);
  const bounds = await page.locator('#catalogToggle').boundingBox();
  const opened = await page.evaluate(([x, y]) => {
    const W = window.liveIt, app = W.app;
    const desired = [x / innerWidth, y / innerHeight];
    const hand = W.synth({ pose: 'pinch', cx: 0.5, cy: 0.5, s: 0.085 });
    const pinchCenter = [(hand[4][0] + hand[8][0]) / 2, (hand[4][1] + hand[8][1]) / 2];
    const dx = desired[0] - pinchCenter[0], dy = desired[1] - pinchCenter[1];
    const positioned = hand.map(([px, py]) => [px + dx, py + dy]);
    for (let i = 0; i < 3; i++) app.ctl.onHand(positioned, app.t);
    app.updateGestureCursor(app.ctl, app.t);
    return document.body.classList.contains('catalog-open');
  }, [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]);
  expect(opened).toBe(true);
});
