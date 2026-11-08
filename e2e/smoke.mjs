// Real Chromium smoke against the production Vite preview, not a mocked canvas.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  for (const config of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const context = await browser.newContext({
      viewport: config.viewport, deviceScaleFactor: 1,
      isMobile: config.isMobile, hasTouch: config.hasTouch,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
    await page.locator('#viewport canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(900);
    const dimensions = await page.locator('#viewport canvas').evaluate(
      (canvas) => ({ w: canvas.width, h: canvas.height }),
    );
    assert.ok(dimensions.w >= 350 && dimensions.h >= 500, '3D canvas should have dimensions');
    assert.equal(await page.locator('#shots').innerText(), '00');
    await page.screenshot({
      path: 'artifacts/snooker-' + config.name + '.png', fullPage: true,
      animations: 'disabled',
    });
    await page.locator('#strike').click();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '01');
    await page.locator('#restart').click();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '00');
    assert.deepEqual(errors, [], config.name + ' browser runtime errors');
    console.log('SNOOKER_BROWSER_' + config.name.toUpperCase() + '_PASS', dimensions);
    await context.close();
  }
} finally {
  await browser.close();
}
