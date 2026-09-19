# Vendored patch — @payloadcms/ui 3.88.0

**Upstream bug:** [payloadcms/payload#17095](https://github.com/payloadcms/payload/issues/17095)
(OPEN, no fix release as of 2026-09-19) — `PageConfigProvider` destructures
`useConfig()` (React 19 `use(Context)`), which returns the context default
`undefined` when no layout-level `ConfigProvider` is an ancestor. Every
`/admin/login` and `/admin/create-first-user` RENDER crashes:

```
TypeError: Cannot destructure property 'config' of 'U(...)' as it is undefined
```

Symptom in local-pm: `/admin/login` → 500 (`digest` error) → Next.js client
fallback "Application error: a client-side exception has occurred".

**Why bisect showed `users >= 1` as the trigger:** with an empty users
collection the login route early-redirects (307 → create-first-user) and the
crashing component never renders; with any user, the login view renders and
explodes. The user CONTENT was never the bug.

## The patch (3 guards)

In `dist/providers/Config/index.js` → `PageConfigProvider`:

1. `useConfig() ?? {}` — never destructure undefined
2. `if (!rootConfig || !setRootConfig)` → render `ConfigProvider` with the
   page config (this component BECOMES the root provider) and skip the
   root-config effect
3. implicit: the destructuring of `rootConfig.unauthenticated` below only
   runs with a real root config

Semantics: identical to the intended one — the page-level provider supplies
the config when the layout did not.

## Lifecycle / removal criteria

- pnpm `patchedDependencies` (root `package.json`) + `patches/@payloadcms__ui@3.88.0.patch`
- Docker: the Dockerfile `COPY . .` brings `patches/` into the build stage;
  `pnpm install --frozen-lockfile` applies it (lockfile carries the hash).
- **Remove the patch when:** Payload ships a release ≥ 3.88.0 containing the
  #17095 fix (watch release notes / the issue closing commit), then
  `pnpm patch-remove @payloadcms/ui` + bump + full gate
  (`pnpm verify` + `make e2e-test`).
