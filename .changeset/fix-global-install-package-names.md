---
"@made-by-moonlight/athene": patch
"@made-by-moonlight/athene-cli": patch
---

Fix global npm install broken by stale pre-rename package names

`athene start` was failing with "Dependencies not installed" after `npm install -g` because two files still referenced the old short package names from before the `ao → athene` rename:

- `packages/athene/bin/postinstall.js` looked for `@made-by-moonlight/cli`, `@made-by-moonlight/core`, and `@made-by-moonlight/web` — packages that no longer exist.
- The published 0.9.2 `dist/lib/preflight.js` looked for `@made-by-moonlight/core` instead of `@made-by-moonlight/athene-core`.

Updated `postinstall.js` to use the correct `athene-cli`, `athene-core`, and `athene-web` names. The CLI source (`preflight.ts`) was already correct and the fix will be included in the rebuilt dist.
