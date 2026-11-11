# 🎱 Billiards of Matthias

A playable **single-player American pool 8-ball** game in real 3D, with free practice and a solo 15-ball clearance challenge, part of ShadowOps. The current repository, npm package and staging technical IDs retain their original `snooker` names for backward compatibility with the protected Identity/Cloudflare deployment. Product branding is **Billiards of Matthias**.

## Pool practice (current)

- Fifteen numbered object balls: solids 1–7, black 8 in the centre of the third rack row, stripes 9–15. The two back corners are a solid and a stripe, and the white starts on the centre of the head string.
- White balls, solids and stripes use dedicated 3D colours/bands with visible numbers; the geometry and collision simulation use one shared pool-scale ball radius.
- Six pockets with rounded jaw collisions, deterministic 120 Hz physics, cushion rebounds, friction and cue follow/draw approximation.
- Short, original **local Web Audio** cues for the cue stroke, measured ball collisions, cushions and actual pocket/scratch events; loudness responds to the physical impact with a tight rate limit, so break shots do not produce a wall of sound. No audio assets, remote audio services or sound before a real player action. A compact speaker control saves only an on/off browser preference and degrades silently on unsupported/blocked WebAudio.
- Brief pocket-local glow on real pot/scratch events, with reduced-motion-safe fallback. No visual bloom or glow while no pocket event occurs.
- Real interactive Three.js table, cenital and 3D cameras, contact/jaw predictor, desktop/mouse and touch controls, fine aim, shot charging and reset.
- Potted object balls **stay down**, including the black 8, rather than reappearing like snooker colours.
- Scratched white is ball-in-hand anywhere legally clear on the cloth after balls stop; touch a vacant position or press **COLOCAR** to choose a safe default.
- Shot/pot counters and Matthias's occasional sarcastic remarks.

## Single-player challenge: Desafío 15

**Libre** is the default; switch to **Desafío 15** to try to clear the entire 15-ball rack in as few physical cue strokes as possible. Changing modes or restarting deliberately resets the current rack.

- Every genuinely completed shot counts as one stroke. Only actual pocket collision events reduce the remaining balls; shots with no pots are misses.
- White scratches are tracked as faults (you can reposition the white safely with normal ball-in-hand), and a fault or miss breaks the streak of consecutive successful strokes.
- Potting multiple balls in the same shot counts all of them. The challenge celebrates combos and real potting streaks; the jokes from Matthias depend on the actual shot outcome, not estimated performance.
- Only clearing **all 15 object balls** establishes a finish. Your best is the **fewest actual strokes**, with fewer scratches as the tiebreaker. No fake completed scores, no time-based grind.
- Your personal best persists **in the current browser only** via a small versioned localStorage entry. It never stores authentication credentials or uploads play statistics. If browser storage is blocked, play keeps working and the best is maintained only within the current page session.

The two-player 8-ball referee remains headless and unit-tested in `src/eightBallRules.js`, but **two-player play has deliberately been removed from the visible UI** until it is a priority again. The solo challenge uses its own independent counter; it does not apply two-player fouls/turns to free practice.

## Development

Requires Node.js 22+.

```sh
npm install
npm test
npm run build
npm run dev
```

`npm run smoke` executes the real browser desktop/mobile WebGL checks after starting the Vite preview at `http://127.0.0.1:4173/` (Playwright dependencies required).

## Protected staging

The game repo produces a CI-tested immutable frontend artifact. **It does not deploy to Cloudflare Pages or contain Identity secrets**. The `evilsysadmin/shadowops-infra` repo owns the existing private Pages project, ShadowOps Identity audience, DNS, deployment gate and guest-denial checks.

Technical staging URL: **https://staging.snooker.shadowops.dpdns.org/**. Do not rename Cloudflare Pages, the service audience, repo or DNS as part of a frontend-only game iteration. A coordinated migration with separate rollback is needed if those identifiers are eventually renamed.

## Structure

- `src/physics.js`: deterministic, headless ball/rail/pocket physics, centred white and pool triangle.
- `src/practiceRules.js`: free-practice remaining-ball/clearance counters.
- `src/soloChallenge.js`: immutable solo 15-ball scoring and versioned local record.
- `src/eightBallRules.js`: retained pure two-player referee, intentionally not exposed in the current interface.
- `src/main.js`: real Three.js scene, cue, stripes/numbers, input and HUD.
- `src/styles.css`: desktop/mobile presentation.
- `e2e/smoke.mjs`: real desktop/mobile WebGL interaction checks.
