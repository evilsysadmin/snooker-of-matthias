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
        brand: rect('.brand'), scoreboard: rect('.scoreboard'),
        controls: rect('.bottom-panel'), switcher: rect('.camera-switch'),
        pageWidth: document.documentElement.scrollWidth,
        windowWidth: window.innerWidth,
      };
    });
    assert.ok(layout.viewport.top >= layout.header.bottom - 1, 'table viewport clears header');
    assert.ok(layout.viewport.bottom <= layout.controls.top + 1, 'table viewport clears controls');
    const overlaps = (a, b) =>
      a.left < b.right - 1 && a.right > b.left + 1 &&
      a.top < b.bottom - 1 && a.bottom > b.top + 1;
    assert.ok(!overlaps(layout.switcher, layout.brand), 'camera switch clears brand');
    assert.ok(!overlaps(layout.switcher, layout.scoreboard), 'camera switch clears scoreboard');
    assert.ok(layout.switcher.bottom < layout.controls.top, 'camera switch clears controls');
    if (config.isMobile) {
      assert.ok(layout.switcher.bottom <= layout.viewport.top + 35,
        'mobile camera selector stays above the upper tabletop cushion');
    }
    assert.ok(layout.pageWidth <= layout.windowWidth + 1, 'no horizontal scrolling');
    const spinControl = page.locator('#spin-cycle');
    assert.equal(await spinControl.getAttribute('data-spin'), '0', 'default shot uses centre hit');
    const selectSpin = async () => {
      if (config.isMobile) await spinControl.tap();
      else await spinControl.click();
    };
    await selectSpin();
    assert.equal(await spinControl.getAttribute('data-spin'), '1', 'follow selectable');
    await selectSpin();
    assert.equal(await spinControl.getAttribute('data-spin'), '-1', 'draw selectable');
    await selectSpin();
    assert.equal(await spinControl.getAttribute('data-spin'), '0', 'centre selectable again');
    await selectSpin();
    assert.equal(await spinControl.getAttribute('data-spin'), '1');
    assert.equal(await page.locator('#shots').innerText(), '00', 'spin choice never fires a shot');
    // Point at the brown spot from the opening cue position. Project known
    // world coordinates through the same orthographic framing in both sizes.
    const brownScreen = await page.locator('#viewport canvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const portrait = rect.width <= 700 && rect.height > rect.width * 1.15;
      const halfWorldWidth = portrait ? 2.51 : 4.75;
      const halfWorldHeight = portrait ? 4.75 : 2.51;
      const halfHeight = Math.max(halfWorldHeight / 0.89, halfWorldWidth / (aspect * 0.89));
      const scale = rect.height / (2 * halfHeight);
      const brownX = -2.30, brownZ = 0;
      return portrait
        ? { x: rect.left + rect.width / 2 + brownZ * scale,
            y: rect.top + rect.height / 2 - brownX * scale }
        : { x: rect.left + rect.width / 2 + brownX * scale,
            y: rect.top + rect.height / 2 + brownZ * scale };
    });
    await page.mouse.move(brownScreen.x, brownScreen.y);
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '18');
    if (config.isMobile) {
      assert.equal(await page.locator('#fine-angle').innerText(), '0,0°');
      await page.locator('#fine-right').tap();
      assert.equal(await page.locator('#fine-angle').innerText(), '+0,5°');
      assert.equal(await page.locator('#shots').innerText(), '00', 'fine aim does not fire');
      await page.locator('#fine-left').tap();
      assert.equal(await page.locator('#fine-angle').innerText(), '0,0°');
      await page.locator('#fine-left').tap();
      assert.equal(await page.locator('#fine-angle').innerText(), '−0,5°');
      // A fresh pointer aim is the new baseline. Controls never change the score.
      await page.mouse.move(brownScreen.x + 1, brownScreen.y);
      await page.waitForFunction(() => document.querySelector('#fine-angle')?.textContent === '0,0°');
      await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '18');
      await page.locator('#fine-right').tap();
      assert.equal(await page.locator('#fine-angle').innerText(), '+0,5°');
    }
    await page.screenshot({
      path: 'artifacts/snooker-' + config.name + '-top.png', fullPage: true,
      animations: 'disabled',
    });
    await page.locator('#camera-3d').click();
    assert.equal(await page.locator('#viewport').getAttribute('data-camera'), '3d');
    assert.equal(await page.locator('#camera-3d').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#viewport').getAttribute('data-aim-target'), '18',
      'camera switch preserves predicted first contact');
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
    if (config.isMobile) await page.locator('#strike').tap();
    else await page.locator('#strike').click();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '01');
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '',
      undefined, { timeout: 5000 });
    assert.equal(await spinControl.isDisabled(), true, 'cannot change spin while the balls roll');
    if (config.isMobile) assert.equal(await page.locator('#fine-right').isDisabled(), true,
      'fine aim is disabled while balls move');
    await page.locator('#camera-3d').click();
    assert.equal(await page.locator('#shots').innerText(), '01', 'camera switch preserves live game');
    await page.locator('#camera-top').click();
    await page.locator('#restart').click();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '00');
    assert.equal(await spinControl.getAttribute('data-spin'), '0', 'restart resets spin');
    // The stroke button accepts a deliberate hold on both desktop and mobile.
    const strikeBounds = await page.locator('#strike').boundingBox();
    const sx = strikeBounds.x + strikeBounds.width / 2;
    const sy = strikeBounds.y + strikeBounds.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('#strike')?.classList.contains('charging') &&
      Number(document.querySelector('#power')?.value) >= 35);
    assert.equal(await page.locator('#shots').innerText(), '00', 'holding only charges, no premature shot');
    await page.screenshot({
      path: 'artifacts/snooker-' + config.name + '-charging.png', fullPage: true,
      animations: 'disabled',
    });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '01');
    assert.equal(await page.locator('#strike').evaluate((el) => el.classList.contains('charging')),
      false, 'charging state clears upon release');
    await page.locator('#restart').click();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '00');
    // Dragging off the button cancels the charge rather than firing unexpectedly.
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.waitForFunction(() => Number(document.querySelector('#power')?.value) >= 25);
    await page.mouse.move(sx, sy - 130);
    await page.mouse.up();
    assert.equal(await page.locator('#shots').innerText(), '00', 'release outside cancels');
    assert.equal(await page.locator('#strike').evaluate((el) => el.classList.contains('charging')),
      false, 'cancel clears charging state');
    if (config.isMobile) assert.equal(await page.locator('#fine-angle').innerText(), '0,0°',
      'restart resets the fine-aim adjustment');
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
