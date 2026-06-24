---
"@made-by-moonlight/athene": patch
---

Fix `npm install -g @made-by-moonlight/athene` failing with `EUNSUPPORTEDPROTOCOL workspace:*`.

The publish script was calling `npm publish` directly, which does not understand pnpm's `workspace:*` protocol and published the literal string to npm. The fix uses `pnpm pack` to generate the tarball (which rewrites `workspace:*` to the resolved semver range) and then passes that tarball to `npm publish` for OIDC-authenticated upload.
