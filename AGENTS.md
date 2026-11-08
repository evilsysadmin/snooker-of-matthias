# Snooker of Matthias — agent instructions

- This is a separate ShadowOps game repository. Its initial milestone is a genuinely playable **3D** browser billiards table, not a static mock. Prefer shipping a working shot over building speculative game modes.
- Graphics are Three.js 3D; initial physics is a deterministic fixed-step planar billiards simulation independent of rendering. Keep it testable without the browser. Do not call this a full snooker rules engine; first release is free practice / pocketing.
- First prioritize aim, striking, collisions, pocketing, scratch, restart and responsive phone/desktop controls. Then visual polish and richer rules, in small tested PRs. Do not make cue-ball mechanics depend on a remote LLM.
- Main is stable, create PRs for focused changes and run unit tests plus a production build. No fake green CI or deployment claims.
- **Frontend hosting belongs to Cloudflare Pages**, not GitHub Pages. Target hostname: staging.snooker.shadowops.dpdns.org. ShadowOps Infra owns Cloudflare Pages, DNS, service credentials, application gating and deployment; do not create DNS/Pages resources or configure a public anonymous staging app from this repo. See evilsysadmin/shadowops-infra.
- Any authenticated staging must comply with shared ShadowOps Identity at the Cloudflare edge (fail closed). This game repo currently contains only public code and no identity wiring. CI produces a build artifact only; **a green CI is not a live staging deployment**.
- No product secrets, tokens, API credentials, server-only account state or user identifiers in Vite / browser source.
- Keep UI readable on mobile and avoid accidental full-page scrolling during play.
