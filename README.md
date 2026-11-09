# 🎱 Snooker of Matthias

A deliberately small but **playable 3D snooker** experiment for the ShadowOps family. No physics-engine Kubernetes cluster (yet).

## First POC

- Real 3D table with cloth baulk/D markings, colour spots, rounded cushion noses, dark leather-look pocket mouths, cue and 22 snooker balls: 15 reds, six coloured balls and the white.
- Play with the default true overhead (orthographic) camera or switch instantly to the cinematic 3D camera using **Cenital / 3D**; both use the same table, balls and shot state.
- Aim by moving/dragging on the table in either camera; the guide stops at the first ball (ghost-white ring and contact point) or cushion, without predicting spin or rebounds.
- On narrow/mobile screens use the **↶ / ↷ 0,5°** fine-aim buttons below shot power for sub-degree corrections; tapping the table resets the displayed correction baseline.
- **Tactile cue stroke** on desktop and mobile: tap **GOLPEAR** to shoot with the selected slider power, or hold it to charge a visible rising/falling strength and release to strike. The cue draws back during charge and briefly animates its tip on release. Drag off the strike button to cancel instead of firing. SPACE offers the same hold-to-charge behavior, while focused buttons retain normal keyboard activation.
- The compact **● Centro → ↑ Sigue → ↓ Retro** button cycles cue-ball strike effects. Follow/draw change actual cue motion via a deterministic, bounded cloth-traction approximation after contact; not a full angular-velocity model. The first-contact aiming guide does not predict post-impact spin paths.
- Fixed-step deterministic collision, cushions, friction, pocket capture, white-ball scratch/respawn.
- Shot and pocket counters, reset, mobile-friendly interface and occasional Matthias snark.
- **Free practice only**: authentic snooker layout and colours, but no official snooker turn/scoring/respotted-colour rules, AI, **side spin (English)** or multiplayer yet. Follow/draw is an initial simplified simulation, not a calibrated real-world snooker model.

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
