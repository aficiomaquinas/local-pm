/**
 * config/oidc-dev/server.mjs — disposable dev IdP for the local-pm E2E stack.
 *
 * Covers the MCP machine-to-machine leg (RFC 6749 §4.4 client_credentials)
 * that dex v2.45.1 cannot serve (no release carries PR #4583 — see
 * docs/investigations/2026-09-10_idp-alternatives-dex.md). Runs as the
 * `oidc-dev` compose service of the E2E stack (docker-compose.e2e.yml,
 * INV-E2E-STACK R2/R3).
 *
 * Deliberate design choices:
 *  - In-memory adapter (default): state lives for the process only — the
 *    E2E stack is disposable by design; nothing to back up or migrate.
 *  - Signing keys are generated at boot (ephemeral). Consumers fetch the
 *    JWKS via discovery at connection time, so a restart is transparent.
 *  - NO interaction UI: this issuer only serves non-interactive grants.
 *    The human PKCE leg belongs to dex (dex-e2e service).
 *  - No `groups` claim engineering on the m2m token: local-pm derives the
 *    agent role from the `client_id` claim (SPC-006 §6), which
 *    client_credentials tokens carry natively as `sub` + `client_id`.
 *
 * Issuer note: the issuer URL must match what CONSUMERS use. Inside the
 * compose network the app container talks to http://oidc-dev:5558 — that is
 * the baked default (env ISSUER). oidc-provider validates that the issued
 * tokens/discovery carry exactly this value.
 */

import { Provider } from 'oidc-provider'

const PORT = Number(process.env.PORT || 5558)
const ISSUER = process.env.ISSUER || 'http://oidc-dev:5558'

const configuration = {
  // local-pm's verify mode default is `jwks` (SPC-006 §6): access tokens MUST
  // be JWTs. In oidc-provider v9 the access-token FORMAT is a Resource-Server
  // property (RFC 8707): tokens are opaque UNLESS issued for a resource whose
  // getResourceServerInfo says accessTokenFormat: 'jwt' (verified live and in
  // lib/models/formats/index.js). defaultResource pins the indicator for
  // requests that don't send `resource`, so every m2m token becomes a JWT.
  features: {
    // RFC 6749 §4.4 — the reason this service exists (dex gap, INV-IDP-ALT).
    clientCredentials: { enabled: true },
    resourceIndicators: {
      defaultResource: () => 'urn:local-pm:api',
      getResourceServerInfo: (ctx, resourceIndicator, client) => ({
        audience: resourceIndicator,
        accessTokenFormat: 'jwt',
        accessTokenTTL: 10 * 60,
        scope: 'openid api',
      }),
    },
  },

  clients: [
    {
      // Mirrors config/dex/config.yml staticClients.local-pm-mcp (same
      // credentials) so the smoke script uses ONE set of m2m values.
      client_id: 'local-pm-mcp',
      client_secret: 'mcp-secret-dev-only',
      grant_types: ['client_credentials'],
      // client-credentials-only recipe (panva docs): no redirect flows.
      response_types: [],
      redirect_uris: [],
    },
  ],

  // Only exercised by interactive flows; client_credentials never calls it.
  // Provided to satisfy the provider contract (and future local experiments).
  findAccount: async (ctx, id) => ({
    accountId: id,
    claims: async () => ({ sub: id, preferred_username: id }),
  }),
}

const provider = new Provider(ISSUER, configuration)

provider.listen(PORT, () => {
  console.log(`[oidc-dev] listening on :${PORT} (issuer ${ISSUER})`)
})
