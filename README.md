# 🎱 Billiards of Matthias

A playable **American pool 8-ball** game in real 3D with free practice and a local two-player house-rules match, part of ShadowOps. The current repository, npm package and staging technical IDs retain their original `snooker` names for backward compatibility with the protected Identity/Cloudflare deployment. Product branding is **Billiards of Matthias**.

## Pool practice (current)

- Fifteen numbered object balls: solids 1–7, black 8 in the centre of the third rack row, stripes 9–15. The two back corners are a solid and a stripe, and the white starts on the centre of the head string.
- White balls, solids and stripes use dedicated 3D colours/bands with visible numbers; the geometry and collision simulation use one shared pool-scale ball radius.
- Six pockets with rounded jaw collisions, deterministic 120 Hz physics, cushion rebounds, friction and cue follow/draw approximation.
- Real interactive Three.js table, cenital and 3D cameras, contact/jaw predictor, desktop/mouse and touch controls, fine aim, shot charging and reset.
- Potted object balls **stay down**, including the black 8, rather than reappearing like snooker colours.
- Scratched white is ball-in-hand anywhere legally clear on the cloth after balls stop; touch a vacant position or press **COLOCAR** to choose a safe default.
- Shot/pot counters and Matthias's occasional sarcastic remarks.

## Two-player local 8-ball (friendly house rules)

Select **2 jugadores** in the top bar to start a new pass-and-play match on the same real 3D table. **Práctica** remains the default; switching modes or restarting resets the rack.

- The opening break must pocket an object or send four *different object balls* to a cushion; otherwise the rival receives ball-in-hand. A black on the break triggers an immediate rerack instead of awarding victory.
- The table stays open after the break. The first legal later shot potting only lisas **or** rayadas assigns that group and the other group to the rival. If both groups pot on the same stroke, the table stays open and the turn passes.
- After the first white/object contact, something must hit a rail or an object must drop. The first contact must be with your group, or with the black 8 after all of your group has been cleared **before the stroke**.
- Legal own-group pots let you continue; misses or opponent-group pots pass the turn. Fouls (scratch, wrong first hit, missing required rail/pocket, illegal break) give the next player the white **in hand anywhere safe on the cloth**.
- When only your black 8 remains, **announce its pocket** with the on-screen selector. Potting it cleanly into the selected pocket wins; an early eight, wrong pocket or scratch on the eight loses.
- Matthias announces decisions using measured shot events: cue/object impact, cushion and actual pocket index, never invented shots.

These are intentionally **simplified local house rules, not official WPA competition 8-ball**. There is no online multiplayer, shot-call requirement for ordinary solids/stripes, tournament administration or automatic dispute resolution. The first release is aimed at a fun, repeatable two-player local game rather than a rules-certified competitive simulator.

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
- `src/eightBallRules.js`: pure, headless two-player house-rule referee with deterministic foul/win decisions.
- `src/main.js`: real Three.js scene, cue, stripes/numbers, input and HUD.
- `src/styles.css`: desktop/mobile presentation.
- `e2e/smoke.mjs`: real desktop/mobile WebGL interaction checks.
