# 🎱 Snooker of Matthias

A deliberately small but **playable 3D snooker** experiment for the ShadowOps family. No physics-engine Kubernetes cluster (yet).

## First POC

- Real 3D table with cloth baulk/D markings, colour spots, rounded cushion noses, dark leather-look pocket mouths, cue and 22 snooker balls: 15 reds, six coloured balls and the white.
- Play with the default true overhead (orthographic) camera or switch instantly to the cinematic 3D camera using **Cenital / 3D**; both use the same table, balls and shot state.
- Aim by moving/dragging on the table in either camera; choose power and strike via button or Space.
- Fixed-step deterministic collision, cushions, friction, pocket capture, white-ball scratch/respawn.
- Shot and pocket counters, reset, mobile-friendly interface and occasional Matthias snark.
- **Free practice only**: authentic snooker layout and colours, but no official snooker turn/scoring/respotted-colour rules, AI, spin/English or multiplayer yet.

## Local development

Requires Node 22+.

~~~sh
npm install
npm test
npm run dev
npm run build
~~~

Open the URL Vite prints. Use the mouse, touch, the shot button or Space; R resets.

## Delivery boundary

The checked-in GitHub Actions workflow tests and builds immutable source into dist/. It uploads a 7-day artifact; **it does not deploy**. Cloudflare Pages, DNS, staging access/Identity and any live publication belong to **evilsysadmin/shadowops-infra**.

Desired staging origin: **https://staging.snooker.shadowops.dpdns.org**.

Do not point the hostname at a public unprotected Pages preview. Before live activation, Infra must provision the Pages project, secure it with ShadowOps Identity at the edge, allow the actual publish workflow and verify real authorization and the exact deployed source SHA. A build passing CI is not proof of deployment.

## Architecture

- src/physics.js: headless planar physics, 120 Hz fixed-step in the browser, plain JavaScript unit tests.
- src/main.js: Three.js scene / rendering / input / HUD.
- src/styles.css: desktop + mobile HUD.
- No backend, remote data or persistent accounts.

Build a fun billiards shot before expanding the scope.
