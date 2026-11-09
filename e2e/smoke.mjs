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
    assert.match(await page.locator('#potted').innerText(), /\/ 21/, 'snooker counts 21 object balls');
    assert.equal(await page.locator('#viewport').getAttribute('data-camera'), 'top');
    assert.equal(await page.locator('#camera-top').getAttribute('aria-pressed'), 'true');
    const layout = await page.evaluate(() => {
      const rect = (query) => document.querySelector(query).getBoundingClientRect();
      return {
        viewport: rect('#viewport'), header: rect('.topbar'),
        controls: rect('.bottom-panel'), switcher: rect('.camera-switch'),
        pageWidth: document.documentElement.scrollWidth,
        windowWidth: window.innerWidth,
      };
    });
    assert.ok(layout.viewport.top >= layout.header.bottom - 1, 'table viewport clears header');
    assert.ok(layout.viewport.bottom <= layout.controls.top + 1, 'table viewport clears controls');
    assert.ok(layout.switcher.top >= layout.header.bottom - 1, 'camera switch clears header');
    assert.ok(layout.switcher.bottom < layout.controls.top, 'camera switch clears controls');
    assert.ok(layout.pageWidth <= layout.windowWidth + 1, 'no horizontal scrolling');
    await page.screenshot({
      path: 'artifacts/snooker-' + config.name + '-top.png', fullPage: true,
      animations: 'disabled',
    });
    await page.locator('#camera-3d').click();
    assert.equal(await page.locator('#viewport').getAttribute('data-camera'), '3d');
    assert.equal(await page.locator('#camera-3d').getAttribute('aria-pressed'), 'true');
    await page.screenshot({
      path: 'artifacts/snooker-' + config.name + '-3d.png', fullPage: true,
      animations: 'disabled',
    });
    await page.locator('#camera-top').click();
    assert.equal(await page.locator('#viewport').getAttribute('data-camera'), 'top');
    // A focused camera button should accept Space without firing a shot.
    await page.locator('#camera-3d').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#viewport').getAttribute('data-camera'), '3d');
    assert.equal(await page.locator('#shots').innerText(), '00');
    await page.locator('#camera-top').click();
    await page.locator('#strike').click();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '01');
    await page.locator('#camera-3d').click();
    assert.equal(await page.locator('#shots').innerText(), '01', 'camera switch preserves live game');
    await page.locator('#camera-top').click();
    await page.locator('#restart').click();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '00');
    // Blur the reset button so Space exercises gameplay charge, not native button activation.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('Space');
    await page.waitForFunction(() => Number(document.querySelector('#power')?.value) >= 35);
    await page.keyboard.up('Space');
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
