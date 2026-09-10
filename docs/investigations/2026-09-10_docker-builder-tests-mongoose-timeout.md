# Investigation — `docker compose build` dies in the builder test stage (mongoose serverSelection vs vitest testTimeout)

**Date:** 2026-09-10
**Status:** root cause confirmed (operator-reported + reproduced); fix implemented (test-stage hermeticity, primary; builder-stage scoping, defensive).
**Environment:** local-pm @ be56a43 — `docker compose up --build` (builder stage, `RUN pnpm -r --no-bail test`).
**Related:** SPC-003 §5.3 (build-time test gate), SPC-006 §5 (OIDC route handlers), `apps/web/tests/o2.oidc-handlers-env.test.ts`.

---

## Executive summary

`docker compose up --build` failed deterministically in the builder stage: 2 of the 17
`o2.oidc-handlers-env.test.ts` tests (the `/logout` cases) hit vitest's 5s default
`testTimeout`, killing the build — while the identical suite passed on the host in under
2 seconds. Root cause: the suites **inherited `DATABASE_URI` from the ambient
environment**, and that environment differs between host and builder in exactly the way
that decides whether mongoose fails fast or hangs. The tests were silently depending on
a *failing* database connection to be fast. The fix makes the tests **hermetic** (they
pin their own deterministic fail-fast `DATABASE_URI`) and makes the builder's test stage
**explicitly DB-free**, so no future compose build-arg can re-introduce the asymmetry.

## Symptom

```
RUN pnpm -r --no-bail test     # Dockerfile builder stage
...
⎯ timeouts ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
TEST  GET/POST /api/auth/oidc/logout (§5, AC-9) > clears the session cookie and
      redirects to end_session_endpoint when exposed          # test line 262
TEST  GET/POST /api/auth/oidc/logout (§5, AC-9) > IdP unreachable → local logout
      still succeeds, lands on /                              # test line 278
Error: Test timed out in 5000ms.
Test Files  1 failed | N passed        → build aborts
```

Deterministic, not flaky: every `docker compose build` timed out on exactly the two
`/logout` tests. On the host (`pnpm verify`) the same file passed in ~1.6s.

## Root cause

### The dependency chain

`apps/web/src/app/api/auth/oidc/logout/route.ts` (and `callback/route.ts`) call
`getPayload({ config })`. `payload.config.ts` wires the mongoose adapter:

```ts
db: mongooseAdapter({
  url: process.env.DATABASE_URI || '',
}),
```

`getPayload()` bootstraps the adapter, which calls `mongoose.connect(url)`. Only the
`/logout` tests actually reach that call in the unit environment — the `/callback`
contract tests return early (state/verifier/nonce gates) or fail inside the token
exchange before the `getPayload` line — which is why exactly 2 tests timed out.

### The host-vs-builder asymmetry (the actual mechanism)

`docker-compose.yml` passes `DATABASE_URI` as a **build-arg** (`build.args:` →
Dockerfile `ARG DATABASE_URI` → `ENV DATABASE_URI=$DATABASE_URI` in the builder stage),
and the builder has no route to the `mongodb` service (tests must not need it — SPC-003
§8.3 forbids live network in the suites). So:

| Environment | Ambient `DATABASE_URI` | `mongoose.connect()` behavior | `/logout` tests |
|---|---|---|---|
| Host (`pnpm verify`) | unset → `''` | **throws immediately** on the empty URL | handler `catch` → fallback path → **fast (<1s)** ✅ |
| Docker builder | `mongodb://mongodb:27017/local-pm` (valid format, unreachable) | **retry loop**, `serverSelectionTimeoutMS` default 30s | vitest `testTimeout` (5s) fires first → **test fails** ❌ |

The suites passed on the host *because* the connection failed fast, and failed in the
builder *because* the connection failed slow. A test whose pass/fail depends on how
quickly an ambient environment fails is not hermetic — it was green by accident, and the
compose build-arg (added so `next build` can prerender) silently broke that accident.

### Verification of the mechanism

- Same builder code path with `--build-arg DATABASE_URI` carrying
  `serverSelectionTimeoutMS=1000`: build passes, 207/207 web tests — proving the
  timeout, not the code, was the variable.
- On the host with `DATABASE_URI='mongodb://mongodb:27017/local-pm'` exported: the o2
  file still passes (~2s) — host DNS for the bogus hostname fails fast, unlike the
  builder container, where `mongodb` resolves via the compose network alias and the
  connection attempt then waits the full serverSelection window. The environmental
  dependency is real even where it is not (currently) harmful — which is exactly why
  pinning in the test beats relying on DNS behavior of the day.

## Fix

Two layers, defense in depth:

1. **Primary — the test pins its environment** (`apps/web/tests/o2.oidc-handlers-env.test.ts`,
   `beforeEach`). Chosen option: **(a) pin a deterministic fail-fast `DATABASE_URI`**
   before the dynamic route import:

   ```ts
   process.env['DATABASE_URI'] =
     'mongodb://127.0.0.1:1/local-pm?serverSelectionTimeoutMS=1&connectTimeoutMS=1'
   ```

   Port `1` on loopback is closed → connection refused in milliseconds; the 1ms
   `serverSelectionTimeoutMS`/`connectTimeoutMS` query params cap any residual retry
   window. `DATABASE_URI` was added to the test's `ENV_KEYS` save/restore list so the
   pin never leaks across cases or files.

   Why (a) and not (b) (`vi.mock` of `payload`/`getPayload`): (a) keeps the real
   handler contract under test — `getPayload` genuinely runs and genuinely falls into
   the handler's fail-soft `catch`, which is the code path the `/logout` tests assert —
   with zero mocking infrastructure, and it is fast and deterministic everywhere. (b)
   would be needed only if (a) left residual slowness; it does not (o2 runs ~1.6s
   for 17 tests, before and after). The mocked variant would also have decoupled the
   tests from a real regression class (an adapter config that throws synchronously
   instead of rejecting asynchronously would break the handler's `catch` — only
   visible without the mock).

2. **Defensive — the builder's test stage is explicit** (Dockerfile): the test RUN now
   reads `RUN DATABASE_URI="" pnpm -r --no-bail test` with a comment stating the
   contract: *the test stage is hermetic — no DB, no network; runtime env comes from
   compose at run time.* The scoped per-RUN override was chosen over changing/removing
   the stage-level `ENV DATABASE_URI` because `next build` in the same stage reads
   `DATABASE_URI` during static prerender and the deploy path must keep working
   unchanged (compose build-args stay; the image build still does not require a live
   database — the value only needs to exist, never to connect). With the empty ambient
   value, any future test that reaches `getPayload()` fails *fast* (empty-URL throw)
   instead of hanging, even if its author forgets to pin the env.

Not done, deliberately: skipping the build-time suite (SPC-003 §5.3 exists precisely so
a red suite breaks the build) and adding global mongoose timeouts to `payload.config.ts`
(a runtime concern; the runtime adapter must tolerate a Mongo that is still starting —
deterministic fail-fast belongs to the test, not the app config).

## How to verify

```bash
# 1. Host gate unchanged:
pnpm verify                                   # web 207 + mcp 83, all green

# 2. The previously failing path, exactly as the operator runs it:
docker compose build                          # NO extra build-args
#   → test stage completes: Test Files 2 passed (web 207, mcp 83); build finishes.

# 3. Reproducibility/caching: run the same build a second time → cached/green.

# 4. Optional (host): prove the pin survives a builder-like ambient env —
DATABASE_URI='mongodb://mongodb:27017/local-pm' pnpm --filter local-pm-web test
#   → o2 file green, no timeouts (the test no longer reads the ambient value).
```

## References

- mongoose `serverSelectionTimeoutMS` default of 30s (driver chooses a server for
  topology operations; unreachable hosts retry until the window expires):
  <https://www.mongodb.com/docs/drivers/node/current/fundamentals/connection/timeouts/>
- Payload 3.x `getPayload()` bootstraps the configured adapter on first call:
  <https://payloadcms.com/docs/database/overview>
- vitest default `testTimeout`: 5000ms (per-test, configurable per suite):
  <https://vitest.dev/config/#testtimeout>
- dex `client_credentials` support (PR #4583, commit `fec4f53`, feature flag
  `client_credential_grant_enabled_by_default`): merged but NOT present in the
  v2.45.1 tag — verified live (config accepted, discovery omits the grant,
  token endpoint 400) and at source level (no `ClientCredentials` in the
  tagged `server/handlers.go`). The overlay example keeps the opt-in
  `oauth2.grantTypes` entry so the MCP leg activates with the first release
  carrying the PR: <https://github.com/dexidp/dex/pull/4583>
