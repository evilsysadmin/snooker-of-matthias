# 🎱 Billiards of Matthias

A playable **American pool 8-ball free-practice** game in real 3D, part of ShadowOps. The current repository, npm package and staging technical IDs retain their original `snooker` names for backward compatibility with the protected Identity/Cloudflare deployment. Product branding is **Billiards of Matthias**.

## Pool practice (current)

- Fifteen numbered object balls: solids 1–7, black 8 in the centre of the third rack row, stripes 9–15. The two back corners are a solid and a stripe, and the white starts on the centre of the head string.
- White balls, solids and stripes use dedicated 3D colours/bands with visible numbers; the geometry and collision simulation use one shared pool-scale ball radius.
- Six pockets with rounded jaw collisions, deterministic 120 Hz physics, cushion rebounds, friction and cue follow/draw approximation.
- Real interactive Three.js table, cenital and 3D cameras, contact/jaw predictor, desktop/mouse and touch controls, fine aim, shot charging and reset.
- Potted object balls **stay down**, including the black 8, rather than reappearing like snooker colours.
- Scratched white is ball-in-hand anywhere legally clear on the cloth after balls stop; touch a vacant position or press **COLOCAR** to choose a safe default.
- Shot/pot counters and Matthias's occasional sarcastic remarks.

**Important:** This iteration is `Pool 8-ball · Práctica libre`, **not** a complete official 8-ball rules engine. It does not yet implement turns, break legality, solids/stripes assignment, intentional fouls, called 8-ball pocket or win/loss state. Keep the practice label visible until those rules are implemented and tested.

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
- `src/main.js`: real Three.js scene, cue, stripes/numbers, input and HUD.
- `src/styles.css`: desktop/mobile presentation.
- `e2e/smoke.mjs`: real desktop/mobile WebGL interaction checks.
