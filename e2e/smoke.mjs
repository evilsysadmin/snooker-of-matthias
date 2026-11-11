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
    let publishedSha = 'a'.repeat(40);
    // Exercise the protected release.json contract without a live login.
    await page.route('**/release.json', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        schema: 1, application: 'snooker-of-matthias',
        environment: 'staging', source_sha: publishedSha,
        authentication: { provider: 'shadowops-id', audience: 'snooker', required: true },
      }),
    }));
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
    assert.match(await page.locator('#potted').innerText(), /15 en mesa/, 'pool starts with 15 objects remaining');
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
    if (!config.isMobile) {
      assert.ok(layout.viewport.height >= 680,
        'desktop gets a larger table viewport instead of empty vertical bands');
      assert.ok(layout.controls.width >= 1150, 'controls use available desktop width');
    }
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
    // Point at the apex of the pool triangle from the centred cue position. Project known
    // world coordinates through the same orthographic framing in both sizes.
    const rackScreen = await page.locator('#viewport canvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const portrait = rect.width <= 700 && rect.height > rect.width * 1.15;
      const halfWorldWidth = portrait ? 2.51 : 4.75;
      const halfWorldHeight = portrait ? 4.75 : 2.51;
      const halfHeight = Math.max(halfWorldHeight / 0.89, halfWorldWidth / (aspect * 0.89));
      const scale = rect.height / (2 * halfHeight);
      const rackX = 2.05, rackZ = 0;
      return portrait
        ? { x: rect.left + rect.width / 2 + rackZ * scale,
            y: rect.top + rect.height / 2 - rackX * scale }
        : { x: rect.left + rect.width / 2 + rackX * scale,
            y: rect.top + rect.height / 2 + rackZ * scale };
    });
    await page.mouse.move(rackScreen.x, rackScreen.y);
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
    // The actual opening rack offers a clear line towards the upper-left
    // corner's long-rail jaw. The guide must now identify that physical jaw.
    const jawScreen = await page.locator('#viewport canvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const portrait = rect.width <= 700 && rect.height > rect.width * 1.15;
      const halfWorldWidth = portrait ? 2.51 : 4.75;
      const halfWorldHeight = portrait ? 4.75 : 2.51;
      const halfHeight = Math.max(halfWorldHeight / 0.89, halfWorldWidth / (aspect * 0.89));
      const scale = rect.height / (2 * halfHeight);
      const x = -4.12, z = 2.105;
      return portrait
        ? { x: rect.left + rect.width / 2 + z * scale,
            y: rect.top + rect.height / 2 - x * scale }
        : { x: rect.left + rect.width / 2 + x * scale,
            y: rect.top + rect.height / 2 + z * scale };
    });
    await page.mouse.move(jawScreen.x, jawScreen.y);
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimJaw !== '');
    assert.equal(await page.locator('#viewport').getAttribute('data-aim-target'), '',
      'a jaw hit must not be incorrectly marked as a ball hit');
    await page.screenshot({
      path: 'artifacts/snooker-' + config.name + '-jaw-guide.png', fullPage: true,
      animations: 'disabled',
    });
    await page.mouse.move(rackScreen.x, rackScreen.y);
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
    assert.equal(await page.locator('#viewport').getAttribute('data-aim-jaw'), '',
      'direct re-aiming clears the previous jaw highlight');
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
      await page.mouse.move(rackScreen.x + 1, rackScreen.y);
      await page.waitForFunction(() => document.querySelector('#fine-angle')?.textContent === '0,0°');
      await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
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
    assert.equal(await page.locator('#viewport').getAttribute('data-aim-target'), '1',
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
    // The break actually changes shot state; restart restores the entire
    // fifteen-ball pool rack with no red/colour respotting phase.
    await page.locator('#restart').click();
    await page.waitForFunction(() =>
      document.querySelector('#shots')?.textContent === '00' &&
      (document.querySelector('#potted')?.textContent || '').includes('15 en mesa'));
    assert.match(await page.locator('#potted').innerText(), /00.*15 en mesa/s);
    assert.match(await page.locator('.brand').innerText(), /BILLIARDS OF MATTHIAS/);
    assert.match(await page.locator('.table-label').innerText(), /POOL 8-BALL/);
    assert.equal(await page.locator('#update-banner').isHidden(), true,
      'no spurious banner for the current build');
    // A changed deployed source SHA is signalled without automatically reloading.
    publishedSha = 'b'.repeat(40);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('#update-banner').waitFor({ state: 'visible' });
    assert.match(await page.locator('#update-banner').innerText(), /Nueva versión disponible/);
    assert.match(await page.locator('#update-banner').innerText(), /reinicia la mesa actual/);
    assert.equal(await page.locator('#shots').innerText(), '00',
      'new-release banner does not discard the game');
    await page.locator('#update-later').click();
    assert.equal(await page.locator('#update-banner').isHidden(), true);
    assert.deepEqual(errors, [], config.name + ' browser runtime errors');
    console.log('SNOOKER_BROWSER_' + config.name.toUpperCase() + '_PASS', dimensions);
    await context.close();
  }
} finally {
  await browser.close();
}
