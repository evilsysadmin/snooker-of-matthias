// Real Chromium smoke against the production Vite preview, not a mocked canvas.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { samplePngRGB, screenshotShowsFelt, readPngRgbRect } from './pngFeltProbe.mjs';
import { TOP_CAMERA_FILL, PRECISION_ZOOM } from '../src/poolVisuals.js';

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
    // A real CI build embeds github.sha. Mock the *same* published release
    // first, so no update banner appears unless release.json genuinely moves.
    const verifiedBuildSha = process.env.VITE_SOURCE_SHA || process.env.GITHUB_SHA;
    let publishedSha = /^[a-f0-9]{40}$/.test(verifiedBuildSha || '')
      ? verifiedBuildSha : 'a'.repeat(40);
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
    assert.ok(layout.viewport.bottom <= layout.controls.top + 1,
      'table viewport clears controls: ' + JSON.stringify({
        viewportTop: layout.viewport.top, viewportBottom: layout.viewport.bottom,
        controlTop: layout.controls.top, controlBottom: layout.controls.bottom,
        screen: config.viewport,
      }));
    const overlaps = (a, b) =>
      a.left < b.right - 1 && a.right > b.left + 1 &&
      a.top < b.bottom - 1 && a.bottom > b.top + 1;
    assert.ok(!overlaps(layout.switcher, layout.brand), 'camera switch clears brand');
    assert.ok(!overlaps(layout.switcher, layout.scoreboard), 'camera switch clears scoreboard');
    assert.ok(layout.switcher.bottom < layout.controls.top, 'camera switch clears controls');
    if (config.isMobile) {
      assert.equal(await page.locator('#precision-zoom').isVisible(), false,
        'portrait phone keeps its uncluttered controls');
      assert.ok(layout.switcher.bottom <= layout.viewport.top + 35,
        'mobile camera selector stays above the upper tabletop cushion');
    }
    assert.ok(layout.pageWidth <= layout.windowWidth + 1, 'no horizontal scrolling');
    const portrait = layout.viewport.width <= 700 &&
      layout.viewport.height > layout.viewport.width * 1.15;
    const aspect = layout.viewport.width / layout.viewport.height;
    const hh = Math.max((portrait ? 4.75 : 2.51) / TOP_CAMERA_FILL,
      (portrait ? 2.51 : 4.75) / (aspect * TOP_CAMERA_FILL));
    const apparentTableWidth = (portrait ? 5.02 : 9.5) *
      layout.viewport.height / (2 * hh);
    const usableFraction = apparentTableWidth / layout.viewport.width;
    assert.ok(usableFraction >= (config.isMobile ? 0.67 : 0.88),
      config.name + ' table should fill the playfield, including larger balls; visible fraction=' +
      usableFraction.toFixed(3));
    const soundControl = page.locator('#sound-toggle');
    assert.equal(await soundControl.getAttribute('aria-pressed'), 'true',
      'sound effects are enabled but must not autoplay');
    await soundControl.click();
    assert.equal(await soundControl.getAttribute('aria-pressed'), 'false');
    assert.equal(await soundControl.getAttribute('aria-label'), 'Activar efectos de sonido');
    assert.equal(await page.evaluate(() => localStorage.getItem('shadowops.billiards.effects.v1')),
      'off', 'muting saves a bounded browser-only preference');
    await soundControl.click();
    assert.equal(await soundControl.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('shadowops.billiards.effects.v1')),
      'on', 'sound may be re-enabled after a real gesture');
    const spinControl = page.locator('#spin-cycle');
    assert.equal(await spinControl.getAttribute('data-spin'), '0', 'default shot uses centre hit');
    assert.equal(await spinControl.locator('.spin-disc .spin-dot').count(), 1,
      'spin power is represented by a physical cue-ball with marked contact');
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
    if (!config.isMobile) {
      assert.equal(await page.locator('#precision-zoom').isVisible(), false,
        'standard desktop keeps camera controls off its six-pocket tabletop');
      assert.equal(await page.locator('.fine-aim').isVisible(), true,
        'canonical wide desktop HUD shows precise aiming controls');
      // Unfocused arrow keys use the same deterministic 0.5-degree nudges.
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#fine-angle').innerText(), '−0,5°');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#fine-angle').innerText(), '0,0°');
      assert.equal(await page.locator('#shots').innerText(), '00');
    }
    // Point at the apex of the pool triangle from the centred cue position. Project known
    // world coordinates through the same orthographic framing in both sizes.
    const rackScreen = await page.locator('#viewport canvas').evaluate((canvas, fill) => {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const portrait = rect.width <= 700 && rect.height > rect.width * 1.15;
      const halfWorldWidth = portrait ? 2.51 : 4.75;
      const halfWorldHeight = portrait ? 4.75 : 2.51;
      const halfHeight = Math.max(halfWorldHeight / fill, halfWorldWidth / (aspect * fill));
      const scale = rect.height / (2 * halfHeight);
      const rackX = 2.05, rackZ = 0;
      return portrait
        ? { x: rect.left + rect.width / 2 + rackZ * scale,
            y: rect.top + rect.height / 2 - rackX * scale }
        : { x: rect.left + rect.width / 2 + rackX * scale,
            y: rect.top + rect.height / 2 + rackZ * scale };
    }, TOP_CAMERA_FILL);
    await page.mouse.move(rackScreen.x, rackScreen.y);
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
    const lens = page.locator('#target-lens');
    if (config.isMobile) {
      await lens.waitFor({ state: 'visible' });
      assert.equal(await lens.getAttribute('data-ball-id'), '1',
        'the magnifier must identify the real predicted first contact');
      assert.match(await lens.innerText(), /01/);
      assert.equal(await lens.getAttribute('data-striped'), 'false');
      const targetBounds = await lens.boundingBox();
      const viewportBounds = await page.locator('#viewport').boundingBox();
      assert.ok(targetBounds.x >= viewportBounds.x && targetBounds.x + targetBounds.width <= viewportBounds.x + viewportBounds.width,
        'mobile lens stays inside the viewport gutter');
      assert.equal(await lens.evaluate((el) => getComputedStyle(el).pointerEvents), 'none',
        'lens may never block touch aiming');
    } else {
      assert.equal(await lens.isVisible(), false, 'desktop keeps its uncluttered table');
    }
    // The actual opening rack offers a clear line towards the upper-left
    // corner's long-rail jaw. The guide must now identify that physical jaw.
    const jawScreen = await page.locator('#viewport canvas').evaluate((canvas, fill) => {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const portrait = rect.width <= 700 && rect.height > rect.width * 1.15;
      const halfWorldWidth = portrait ? 2.51 : 4.75;
      const halfWorldHeight = portrait ? 4.75 : 2.51;
      const halfHeight = Math.max(halfWorldHeight / fill, halfWorldWidth / (aspect * fill));
      const scale = rect.height / (2 * halfHeight);
      const x = -4.12, z = 2.105;
      return portrait
        ? { x: rect.left + rect.width / 2 + z * scale,
            y: rect.top + rect.height / 2 - x * scale }
        : { x: rect.left + rect.width / 2 + x * scale,
            y: rect.top + rect.height / 2 + z * scale };
    }, TOP_CAMERA_FILL);
    await page.mouse.move(jawScreen.x, jawScreen.y);
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimJaw !== '');
    assert.equal(await lens.isVisible(), false,
      'the first-contact magnifier never invents a ball when aiming at a jaw');
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
    const topPng = await page.screenshot({
      path: 'artifacts/snooker-' + config.name + '-top.png', fullPage: true,
      animations: 'disabled',
    });
    const tableRect = await page.locator('#viewport').boundingBox();
    assert.ok(screenshotShowsFelt(topPng, tableRect),
      config.name + ' top camera must paint real green felt, not an empty WebGL canvas');
    // The cue is much smaller in portrait. Verify its dark marker in actual
    // WebGL screenshot pixels on BOTH desktop and a 390px touch viewport.
    // DOM/CSS-only embellishments cannot satisfy this visual contract.
    const cueCenter = await page.locator('#viewport canvas').evaluate((canvas, fill) => {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const portrait = rect.width <= 700 && rect.height > rect.width * 1.15;
      const hw = portrait ? 2.51 : 4.75;
      const hh = portrait ? 4.75 : 2.51;
      const halfHeight = Math.max(hh / fill, hw / (aspect * fill));
      const scale = rect.height / (2 * halfHeight);
      return portrait
        ? { x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2 + 2.4 * scale }
        : { x: rect.left + rect.width / 2 - 2.4 * scale,
            y: rect.top + rect.height / 2 };
    }, TOP_CAMERA_FILL);
    const cuePixel = samplePngRGB(topPng, Math.round(cueCenter.x), Math.round(cueCenter.y));
    assert.ok(cuePixel[0] < 155 && cuePixel[2] > cuePixel[0] * 1.18,
      config.name + ' cue spot must contrast against ivory even at phone scale: ' + cuePixel);
    assert.equal(await page.locator('#viewport').getAttribute('data-cue-locator'), 'ready',
      'only the actual playable cue should have its selection marker visible');

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
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.cueLocator === '',
      undefined, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '',
      undefined, { timeout: 5000 });
    assert.equal(await lens.isVisible(), false, 'contact lens hides during a real shot');
    assert.equal(await spinControl.isDisabled(), true, 'cannot change spin while the balls roll');
    if (config.isMobile) assert.equal(await page.locator('#fine-right').isDisabled(), true,
      'fine aim is disabled while balls move');
    await page.locator('#camera-3d').click();
    assert.equal(await page.locator('#shots').innerText(), '01', 'camera switch preserves live game');
    await page.locator('#camera-top').click();
    await page.locator('#restart').click();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '00');
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.cueLocator === 'ready');
    assert.equal(await spinControl.getAttribute('data-spin'), '0', 'restart resets spin');
    // The stroke button accepts a deliberate hold on both desktop and mobile.
    const strikeBounds = await page.locator('#strike').boundingBox();
    const sx = strikeBounds.x + strikeBounds.width / 2;
    const sy = strikeBounds.y + strikeBounds.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('#strike')?.classList.contains('charging') &&
      Number(document.querySelector('#power')?.value) >= 35);
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.cueCharge === 'active');
    assert.equal(await page.locator('#shots').innerText(), '00', 'holding only charges, no premature shot');
    await page.screenshot({
      path: 'artifacts/snooker-' + config.name + '-charging.png', fullPage: true,
      animations: 'disabled',
    });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#shots')?.textContent === '01');
    assert.equal(await page.locator('#strike').evaluate((el) => el.classList.contains('charging')),
      false, 'charging state clears upon release');
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.cueCharge === '');
    assert.equal(await page.locator('#shots').innerText(), '01', 'visual stroke must not duplicate physics shots');
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
    await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.cueCharge === '');
    assert.equal(await page.locator('#shots').innerText(), '00',
      'cancelled pull-back never sends a hidden impulse');
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
    // A changed deployed SHA must not disturb a held SPACE charge. This is
    // exercised in real Chromium, not just the pure update eligibility test.
    if (!config.isMobile) {
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.down('Space');
      await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.cueCharge === 'active');
    }
    publishedSha = 'b'.repeat(40);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    if (!config.isMobile) {
      await page.waitForTimeout(180);
      assert.equal(await page.locator('#update-banner').isHidden(), true,
        'a held keyboard charge must not be covered by the version banner');
      assert.equal(await page.locator('#shots').innerText(), '00',
        'new release must not fire or discard a held stroke');
      // A window blur cancels the charge; a synthetic blur keeps this CI
      // test deterministic and must not cause a shot.
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.keyboard.up('Space');
    }
    await page.locator('#update-banner').waitFor({ state: 'visible' });
    if (!config.isMobile) {
      // An already-visible reminder must also yield to a *new* stroke.
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.down('Space');
      await page.waitForFunction(() => document.querySelector('#viewport')?.dataset.cueCharge === 'active');
      assert.equal(await page.locator('#update-banner').isHidden(), true,
        'active cue input takes priority over an already-visible update');
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.keyboard.up('Space');
      await page.locator('#update-banner').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#shots').innerText(), '00');
    }
    assert.match(await page.locator('#update-banner').innerText(), /Nueva versión disponible/);
    assert.match(await page.locator('#update-banner').innerText(), /reinicia la mesa actual/);
    assert.equal(await page.locator('#shots').innerText(), '00',
      'new-release banner does not discard the game');
    const updateRects = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        update: rect('#update-banner'), camera: rect('.camera-switch'),
        modes: rect('.mode-switch'), controls: rect('.bottom-panel'),
      };
    });
    assert.ok(!overlaps(updateRects.update, updateRects.camera),
      'new release notification never hides camera controls');
    assert.ok(!overlaps(updateRects.update, updateRects.modes),
      'new release notification never hides solo mode buttons');
    assert.ok(!overlaps(updateRects.update, updateRects.controls),
      'new release notification never hides the shot/restart controls');
    await page.locator('#update-later').click();
    assert.equal(await page.locator('#update-banner').isHidden(), true);
    // Only solo modes are visible: the 2-player referee is retained in code
    // but deliberately deferred from the product.
    assert.equal(await page.locator('#mode-versus').count(), 0);
    const soloStatus = page.locator('#solo-status');
    assert.equal(await soloStatus.isHidden(), true);
    await page.locator('#mode-solo').click();
    assert.equal(await page.locator('#mode-solo').getAttribute('aria-pressed'), 'true');
    assert.equal(await soloStatus.isVisible(), true);
    assert.match(await soloStatus.innerText(), /Desafío 15.*15 restantes.*Sin récord/);
    if (config.isMobile) {
      const positions = await page.evaluate(() => ({
        status: document.querySelector('#solo-status').getBoundingClientRect().toJSON(),
        canvas: document.querySelector('#viewport').getBoundingClientRect().toJSON(),
      }));
      assert.ok(positions.status.bottom <= positions.canvas.top + 48,
        'challenge badge stays above the first portrait tabletop rail');
    }
    assert.equal(await page.locator('#viewport').getAttribute('data-game-mode'), 'solo');
    assert.equal(await page.locator('#shots').innerText(), '00', 'switching modes reracks cleanly');

    // A gentle real stroke stays short of the distant rack and gives a
    // deterministic miss. It must count as one actual solo shot, never a pot.
    await page.locator('#power').evaluate((input) => {
      input.value = '5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#strike').click();
    await page.waitForFunction(() =>
      document.querySelector('#solo-status')?.dataset.shots === '1',
      undefined, { timeout: 25000 });
    assert.equal(await soloStatus.getAttribute('data-outcome'), 'miss');
    assert.equal(await soloStatus.getAttribute('data-remaining'), '15');
    assert.equal(await soloStatus.getAttribute('data-streak'), '0');
    assert.equal(await soloStatus.getAttribute('data-scratches'), '0');
    assert.equal(await page.locator('#shots').innerText(), '01');
    assert.equal(await page.locator('#viewport').getAttribute('data-cue-placement'), '');

    // Mode and camera buttons must be separate usable targets on mobile.
    if (config.isMobile) {
      const pair = await page.evaluate(() => ({
        camera: document.querySelector('.camera-switch').getBoundingClientRect().toJSON(),
        modes: document.querySelector('.mode-switch').getBoundingClientRect().toJSON(),
        sound: document.querySelector('#sound-toggle').getBoundingClientRect().toJSON(),
      }));
      assert.ok(!overlaps(pair.camera, pair.modes),
        'mobile solo and sound controls do not cover camera controls');
      assert.ok(pair.sound.width >= 33 && pair.sound.height >= 33,
        'mute control is reachable on mobile');
    }
    const soloPng = await page.screenshot({
      path: 'artifacts/billiards-' + config.name + '-solo.png',
      fullPage: true, animations: 'disabled',
    });
    // A previous mobile smoke passed despite an entirely black WebGL table
    // after the solo stroke. Check actual screenshot pixels, not just DOM/game.
    const glState = await page.locator('#viewport canvas').evaluate((canvas) => {
      const gl = canvas.getContext('webgl2');
      return { lost: gl?.isContextLost() ?? null, width: canvas.width, height: canvas.height };
    });
    assert.ok(screenshotShowsFelt(soloPng, await page.locator('#viewport').boundingBox()),
      config.name + ' solo stroke must retain visible green felt: ' + JSON.stringify(glState));

    // The record survives an explicit new rack. Storage is not used as a
    // game-state oracle; the pure referee tests cover genuinely earned bests.
    await page.evaluate(() => localStorage.setItem(
      'shadowops.billiards.solo15.best.v1',
      JSON.stringify({ version: 1, shots: 9, scratches: 1 }),
    ));
    await page.locator('#restart').click();
    await page.waitForFunction(() =>
      document.querySelector('#solo-status')?.dataset.shots === '0' &&
      document.querySelector('#shots')?.textContent === '00');
    assert.match(await soloStatus.innerText(), /Récord: 9 tiros.*1 faltas/);
    assert.equal(await page.locator('#shots').innerText(), '00');
    await page.locator('#mode-practice').click();
    await page.waitForFunction(() =>
      document.querySelector('#viewport')?.dataset.gameMode === 'practice');
    assert.equal(await soloStatus.isHidden(), true);
    assert.equal(await page.locator('#shots').innerText(), '00');
    assert.deepEqual(errors, [], config.name + ' browser runtime errors');
    console.log('SNOOKER_BROWSER_' + config.name.toUpperCase() + '_PASS', dimensions);
    await context.close();
  }

  // Short laptop viewport: the main player report showed wasted horizontal
  // gutters on a wide but short browser window. This is a real WebGL check
  // with all six rails/pockets in frame and no controls overlapping the game.
  const laptop = await browser.newContext({
    viewport: { width: 1198, height: 614 }, deviceScaleFactor: 1,
  });
  const laptopPage = await laptop.newPage();
  const laptopErrors = [];
  laptopPage.on('pageerror', (error) => laptopErrors.push(error.message));
  await laptopPage.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
  await laptopPage.locator('#viewport canvas').waitFor({ state: 'visible' });
  await laptopPage.waitForTimeout(450);
  const compact = await laptopPage.evaluate(() => {
    const rect = (q) => document.querySelector(q).getBoundingClientRect().toJSON();
    return { viewport: rect('#viewport'), header: rect('.topbar'),
      controls: rect('.bottom-panel'), label: rect('.table-label'),
      gameWidth: window.innerWidth };
  });
  assert.ok(compact.viewport.top >= compact.header.bottom - 1,
    'compact laptop playfield must clear brand and scoreboard');
  assert.ok(compact.viewport.bottom <= compact.controls.top + 1,
    'compact controls must not cover the enlarged table: ' + JSON.stringify(compact));
  const compactAspect = compact.viewport.width / compact.viewport.height;
  const compactHH = Math.max(2.51 / TOP_CAMERA_FILL,
    4.75 / (compactAspect * TOP_CAMERA_FILL));
  const tableWidthPx = 9.5 * compact.viewport.height / (2 * compactHH);
  assert.ok(tableWidthPx / compact.gameWidth > 0.60,
    'short laptop table must fill >60% of browser width without zoom/cropping');
  const laptopPng = await laptopPage.screenshot({
    path: 'artifacts/snooker-compact-laptop-top.png',
    fullPage: true, animations: 'disabled',
  });
  assert.ok(screenshotShowsFelt(laptopPng, compact.viewport),
    'short laptop table must render real WebGL felt');
  assert.deepEqual(laptopErrors, []);
  console.log('SNOOKER_BROWSER_COMPACT_LAPTOP_PASS',
    { viewport: compact.viewport.height, tableWidth: Math.round(tableWidthPx) });
  await laptop.close();

  // 1814x832 is the player's real screenshot resolution. Without the
  // compact wide-desktop chrome the entire *physical* table was undersized.
  const wide = await browser.newContext({
    viewport: { width: 1814, height: 832 }, deviceScaleFactor: 1,
  });
  const widePage = await wide.newPage();
  const wideErrors = [];
  widePage.on('pageerror', (error) => wideErrors.push(error.message));
  await widePage.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
  await widePage.locator('#viewport canvas').waitFor({ state: 'visible' });
  await widePage.waitForTimeout(450);
  const wideLayout = await widePage.evaluate(() => {
    const rect = (q) => document.querySelector(q).getBoundingClientRect().toJSON();
    return { viewport: rect('#viewport'), header: rect('.topbar'),
      controls: rect('.bottom-panel'), switcher: rect('.camera-switch'),
      windowWidth: window.innerWidth };
  });
  assert.ok(wideLayout.viewport.top >= wideLayout.header.bottom - 1,
    'wide tabletop must remain below the full header');
  assert.ok(wideLayout.viewport.bottom <= wideLayout.controls.top + 1,
    'wide tabletop must not hide behind the lower control rail');
  assert.ok(wideLayout.viewport.height >= 680,
    'wide landscape should reclaim vertical room instead of tiny balls');
  const wideAspect = wideLayout.viewport.width / wideLayout.viewport.height;
  const wideHalfHeight = Math.max(2.51 / TOP_CAMERA_FILL,
    4.75 / (wideAspect * TOP_CAMERA_FILL));
  const wideTableWidth = 9.5 * wideLayout.viewport.height / (2 * wideHalfHeight);
  assert.ok(wideTableWidth / wideLayout.windowWidth >= 0.68,
    'wide landscape physical table should fill at least 68% of browser width');
  assert.ok(wideLayout.switcher.left >= (wideLayout.windowWidth + wideTableWidth) / 2,
    'the camera toggle must stay in the side gutter, off the playable table');
  // The real user's 1814x832 desktop: optical close-up must preserve the
  // geometric aim ray, never scale the WebGL canvas or ball physics.
  const rackX = wideLayout.windowWidth / 2 + 2.05 * wideTableWidth / 9.5;
  const rackY = wideLayout.viewport.top + wideLayout.viewport.height / 2;
  await widePage.mouse.move(rackX, rackY);
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
  const zoom = widePage.locator('#precision-zoom');
  assert.equal(await zoom.isVisible(), true, 'wide desktop offers optical precision');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom'), 'full');
  await zoom.click();
  assert.equal(await zoom.getAttribute('aria-pressed'), 'true');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom'), 'precision');
  assert.equal(await widePage.locator('#shots').innerText(), '00');
  const closeRackX = wideLayout.windowWidth / 2 +
    (2.05 + 0.175) * (wideTableWidth / 9.5) * PRECISION_ZOOM;
  await widePage.mouse.move(closeRackX, rackY);
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
  const targetBeforeWheel = await widePage.locator('#viewport').getAttribute('data-aim-target');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom-factor'), '1.4');
  await widePage.mouse.wheel(0, -240); // exactly two optical +0.1 steps
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.zoomFactor === '1.6');
  assert.match(await zoom.innerText(), /1,6/);
  assert.equal(await widePage.locator('#shots').innerText(), '00');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-aim-target'),
    targetBeforeWheel, 'wheel never alters intended first contact');
  // Real raycasting uses the new camera zoom, not the previous screen scale.
  const closeRackAt16 = wideLayout.windowWidth / 2 +
    (2.05 + 0.175) * (wideTableWidth / 9.5) * 1.6;
  await widePage.mouse.move(closeRackAt16, rackY);
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
  await widePage.mouse.wheel(0, 240);
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.zoomFactor === '1.4');
  await widePage.mouse.move(closeRackX, rackY);
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
  await widePage.evaluate(() => document.activeElement?.blur());
  await widePage.keyboard.press('Equal');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom-factor'), '1.5');
  await widePage.keyboard.press('Minus');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom-factor'), '1.4');
  // Large touchpad deltas clamp at 2.2x / 1.2x rather than zooming to infinity.
  await widePage.mouse.wheel(0, -2400);
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom-factor'), '2.2');
  await widePage.mouse.wheel(0, 2400);
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom-factor'), '1.2');
  await widePage.mouse.wheel(0, -240);
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom-factor'), '1.4');
  await widePage.mouse.move(closeRackX, rackY);
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
  const zoomPng = await widePage.screenshot({
    path: 'artifacts/snooker-wide-precision-top.png',
    fullPage: true, animations: 'disabled',
  });
  assert.ok(screenshotShowsFelt(zoomPng, wideLayout.viewport),
    'precision must render the true 3D felt, not a CSS-scaled fake');
  const zoomFocus = Number(await widePage.locator('#viewport').getAttribute('data-camera-focus-x'));
  assert.ok(Math.abs(zoomFocus + 0.175) < 0.005, 'zoom centres on the real cue-to-rack segment');
  const aimBeforePan = await widePage.locator('#viewport').getAttribute('data-aim-target');
  // Right-button drag moves the camera (not the cue or the aim vector).
  await widePage.mouse.move(closeRackX, rackY);
  await widePage.mouse.down({ button: 'right' });
  await widePage.mouse.move(closeRackX + 120, rackY + 80, { steps: 6 });
  await widePage.mouse.up({ button: 'right' });
  const movedX = Number(await widePage.locator('#viewport').getAttribute('data-camera-focus-x'));
  const movedZ = Number(await widePage.locator('#viewport').getAttribute('data-camera-focus-z'));
  assert.ok(movedX < zoomFocus - 0.5 && movedZ < -0.3,
    'right-button drag should pan the orthographic camera in both axes');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-aim-target'),
    aimBeforePan, 'pan cannot silently change the next shot');
  assert.equal(await widePage.locator('#shots').innerText(), '00');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-panning'), '',
    'drag gesture clears on pointer release');
  const pannedPng = await widePage.screenshot({
    path: 'artifacts/snooker-wide-precision-panned.png',
    fullPage: true, animations: 'disabled',
  });
  assert.ok(screenshotShowsFelt(pannedPng, wideLayout.viewport),
    'panned camera still paints the real billiards table');
  // Shift+arrows are accessible camera movement; ordinary arrows remain
  // the pre-existing fine-aim keys.
  await widePage.evaluate(() => document.activeElement?.blur());
  await widePage.keyboard.press('Shift+ArrowRight');
  const keyboardFocus = Number(await widePage.locator('#viewport').getAttribute('data-camera-focus-x'));
  assert.ok(keyboardFocus > movedX + 0.2, 'Shift+Right pans without re-aiming');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-aim-target'),
    aimBeforePan);
  // Shift must be held before moving the cursor to the drag start:
  // ordinary unmodified mouse hover is intentionally still live aiming.
  await widePage.keyboard.down('Shift');
  await widePage.mouse.move(closeRackX, rackY);
  await widePage.mouse.down({ button: 'left' });
  await widePage.mouse.move(closeRackX + 50, rackY, { steps: 3 });
  await widePage.mouse.up({ button: 'left' });
  await widePage.keyboard.up('Shift');
  assert.ok(Number(await widePage.locator('#viewport').getAttribute('data-camera-focus-x')) <
    keyboardFocus - 0.15, 'Shift+left-drag pans without replacing the aim');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-aim-target'),
    aimBeforePan);
  // The raycaster must still target ball 1 at its NEW onscreen location.
  const afterPanFocus = Number(await widePage.locator('#viewport').getAttribute('data-camera-focus-x'));
  const afterPanZ = Number(await widePage.locator('#viewport').getAttribute('data-camera-focus-z'));
  const rackAfterPanX = wideLayout.windowWidth / 2 +
    (2.05 - afterPanFocus) * (wideTableWidth / 9.5) * PRECISION_ZOOM;
  const rackAfterPanY = rackY +
    (0 - afterPanZ) * (wideTableWidth / 9.5) * PRECISION_ZOOM;
  await widePage.mouse.move(rackAfterPanX, rackAfterPanY);
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
  assert.equal(await widePage.locator('#shots').innerText(), '00');
  await zoom.click();
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom'), 'full');
  await zoom.click();
  await widePage.locator('#camera-3d').click();
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom'), 'full',
    'changing to 3D restores full-table framing');
  await widePage.locator('#camera-top').click();
  const widePng = await widePage.screenshot({
    path: 'artifacts/snooker-wide-desktop-top.png',
    fullPage: true, animations: 'disabled',
  });
  assert.ok(screenshotShowsFelt(widePng, wideLayout.viewport),
    'enlarged wide desktop must still render real 3D felt');
  await widePage.locator('#mode-solo').click();
  const soloWide = await widePage.evaluate(() => ({
    tabletop: document.querySelector('#viewport').getBoundingClientRect().toJSON(),
    solo: document.querySelector('#solo-status').getBoundingClientRect().toJSON(),
  }));
  assert.ok(soloWide.tabletop.top >= soloWide.solo.bottom - 1,
    'solo challenge status must stay clear of the enlarged table');

  // Real active-shot camera tracking: a new practice rack with a first-hit
  // prediction illuminates the actual target ball only in precision view.
  await widePage.locator('#mode-practice').click();
  await widePage.mouse.move(rackX, rackY);
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.aimTarget === '1');
  await zoom.click();
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.precisionTarget === '1');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom-factor'), '1.4');
  // Pixel-level golden-state contract: both the ivory white and the real
  // amber target halo must be visible in the rendered Chromium PNG.
  const aimedPng = await widePage.screenshot({
    path: 'artifacts/snooker-wide-precision-target-halo.png',
    fullPage: true, animations: 'disabled',
  });
  const cueStart = {
    x: Math.round(wideLayout.windowWidth / 2 +
      (-2.4 + 0.175) * (wideTableWidth / 9.5) * PRECISION_ZOOM),
    y: Math.round(rackY),
  };
  const patchAt = (buffer, x, y, radius) => readPngRgbRect(buffer, {
    x: Math.round(x - radius), y: Math.round(y - radius),
    width: radius * 2 + 1, height: radius * 2 + 1,
  });
  const countIvory = (pixels) => {
    let n = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      if (pixels[i] > 140 && pixels[i + 1] > 137 && pixels[i + 2] > 120 &&
          Math.abs(pixels[i] - pixels[i + 1]) < 85) n++;
    }
    return n;
  };
  const staticIvory = countIvory(patchAt(aimedPng, cueStart.x, cueStart.y, 18));
  assert.ok(staticIvory >= 70,
    'real 3D cue ball must have a legible ivory silhouette in the zoom screenshot: ' + staticIvory);
  const targetX = Math.round(wideLayout.windowWidth / 2 +
    (2.05 + 0.175) * (wideTableWidth / 9.5) * PRECISION_ZOOM);
  const haloBand = { x: targetX - 18, y: Math.round(rackY) - 34,
    width: 37, height: 20 };
  const haloOn = readPngRgbRect(aimedPng, haloBand);
  // Aim diagonally into clear cloth, avoiding the rack: the white travels far
  // enough to exercise a substantial actual camera follow.
  const wideScale = wideTableWidth / 9.5 * PRECISION_ZOOM;
  await widePage.mouse.move(wideLayout.windowWidth / 2 +
    (-1.0 - (-0.175)) * wideScale, rackY + 1.1 * wideScale);
  await widePage.waitForFunction(() => document.querySelector('#viewport')?.dataset.precisionTarget === '');
  const noHaloPng = await widePage.screenshot({
    path: 'artifacts/snooker-wide-precision-no-target-halo.png',
    fullPage: true, animations: 'disabled',
  });
  const haloOff = readPngRgbRect(noHaloPng, haloBand);
  let distinctAmber = 0;
  for (let i = 0; i < haloOn.length; i += 3) {
    if (haloOn[i] - haloOff[i] > 35 &&
        haloOn[i] > haloOn[i + 2] * 1.27 &&
        haloOn[i + 1] > haloOn[i + 2] * 1.08) distinctAmber++;
  }
  assert.ok(distinctAmber >= 9,
    'the target halo must produce visible amber pixels (not just a visible mesh): ' +
      distinctAmber);
  const followX0 = Number(await widePage.locator('#viewport').getAttribute('data-camera-focus-x'));
  const followZ0 = Number(await widePage.locator('#viewport').getAttribute('data-camera-focus-z'));
  await widePage.locator('#power').evaluate((el) => {
    el.value = '100';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await widePage.locator('#strike').click();
  await widePage.waitForFunction(() => document.querySelector('#shots')?.textContent === '01');
  await widePage.waitForFunction(({ x, z }) => {
    const el = document.querySelector('#viewport');
    return Math.hypot(Number(el?.dataset.cameraFocusX) - x,
      Number(el?.dataset.cameraFocusZ) - z) > 0.25;
  }, { x: followX0, z: followZ0 }, { timeout: 20000 });
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom'), 'precision');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-precision-target'), '',
    'the aiming halo must disappear throughout an active rolling stroke');
  const followPng = await widePage.screenshot({
    path: 'artifacts/snooker-wide-precision-follow-shot.png',
    fullPage: true, animations: 'disabled',
  });
  assert.ok(screenshotShowsFelt(followPng, wideLayout.viewport),
    'the tracked physical shot must keep real WebGL cloth visible');
  // The projected marker is computed from the real cue mesh, but passing CI
  // requires actual bright pixels in its screenshot vicinity. A stale flag,
  // invisible 3D mesh or lost framebuffer cannot satisfy this check.
  const cueScreen = await widePage.locator('#viewport').evaluate((el) => ({
    x: Number(el.dataset.cueScreenX), y: Number(el.dataset.cueScreenY),
    visible: Boolean(el.dataset.cueScreenX && el.dataset.cueScreenY),
  }));
  assert.ok(cueScreen.visible && cueScreen.x > 0 && cueScreen.y > 0,
    'live cue must still project onto the real playing canvas');
  const movingIvory = countIvory(patchAt(followPng, cueScreen.x, cueScreen.y, 38));
  assert.ok(movingIvory >= 65,
    'tracked moving cue must remain legible in real screenshot pixels: ' + movingIvory);
  console.log('SNOOKER_VISUAL_CUE_HALO_PASS',
    { ivory: staticIvory, amber: distinctAmber, movingIvory });
  await widePage.locator('#restart').click();
  assert.equal(await widePage.locator('#viewport').getAttribute('data-zoom'), 'full');
  assert.equal(await widePage.locator('#viewport').getAttribute('data-precision-target'), '');
  assert.deepEqual(wideErrors, [], 'wide desktop browser runtime errors');
  console.log('SNOOKER_BROWSER_WIDE_DESKTOP_PASS',
    { viewport: wideLayout.viewport.height, tableWidth: Math.round(wideTableWidth) });
  await wide.close();
} finally {
  await browser.close();
}
