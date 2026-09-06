# ADR-002 — OIDC-compliant authentication, agent-scoped access, and identity model expansion

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`) |
| **ID** | ADR-002 |
| **Date** | 2026-09-05 |
| **Status** | PROPOSED — pending user review. Sin commit de implementación; este ADR no implementa nada. |
| **Context docs** | [REQ-002 — distinguished actor credentials & role policy](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · [ADR-001 — local-first, loopback-only, two-identity provisioning](2026-09-05_ADR-001_local-first-loopback-binding.md) · [Spec audit trail & restore — §6 Access policy](../specs/2026-09-05_audit-trail-restore-spec.md) |

---

## Context

### Estado actual (verificado en código, 2026-09-05)

- Las tres colecciones (`Projects`, `Teams`, `Tickets` en `src/collections/`) declaran
  `access: { read/create/update/delete: () => true }`: **no existe autenticación**; `req.user`
  es `undefined` en toda operación REST/MCP. `src/payload.config.ts` no registra ninguna
  colección auth-enabled.
- El MCP server (`mcp-server/`) se conecta con `LOCAL_PM_URL` únicamente, sin credenciales:
  hoy un agente y el operador son indistinguibles en la capa de aplicación.
- Payload registra el autor de un cambio a partir del usuario autenticado de la request: sin
  auth, la atribución exigida por REQ-002.2 es imposible (constatación de REQ-002, «Estado actual»).

### Modelo vigente y su dirección

ADR-001 (ACCEPTED) fijó el provisionamiento de **dos identidades** — un single master user
(humano) y un single master agent user (automatización), con credenciales distinguidas — y el
perímetro loopback-only. REQ-002 hace normativo el resultado: credenciales inequívocas por actor
(REQ-002.1), atribución sin ambigüedad (REQ-002.2) y exclusión por policy del agente respecto de
audit trails y rollbacks (REQ-002.4; normativa en §6 del spec SPC-001).

El operador plantea ahora un salto de nivel: adoptar un modelo de autenticación **OIDC-compliant,
estándar y probado**, delegando la autenticación a un OIDC server externo a la app, con la
consiguiente revisión del modelo de identidades (de 1 humano + 1 agente hacia **múltiples humanos
y múltiples agentes**).

### Consecuencias que este ADR debe resolver

1. La delegación a un IdP externo exige un modelo de datos de identidad en Payload (linkage a
   `iss`/`sub` del token), no solo un login alternativo.
2. REQ-002.4 debe seguir garantizado **bajo el nuevo esquema**: la exclusión del agente del trail
   pasa a expresarse contra roles derivados de claims del token.
3. Con N humanos y N agentes aparecen boundaries de datos (¿por grupos?) y la pregunta del
   super-admin (¿panel separado o vista dentro del admin existente?).
4. El provider OIDC **no** se elige aquí: el sistema debe ser agnóstico respecto de si el issuer
   es un servicio self-hosted ya provisionado (o cloud), parametrizable por entorno; y debe existir
   una vía de bootstrap mínimo sin webui para desarrollo.

## Decision

Propuesta (status PROPOSED, sujeta a revisión del usuario):

- **D1 — Autenticación OIDC-compliant delegada.** Payload no autentica credenciales propias:
  valida tokens emitidos por un issuer OIDC configurable (`OIDC_ISSUER`, `OIDC_CLIENT_ID`,
  `OIDC_CLIENT_SECRET` por env, discovery `.well-known/openid-configuration`). La app es un
  relying party estándar; **la elección del provider queda fuera de este ADR** (authentik,
  auth0, keycloak, better-auth, zitadel, etc. no se deciden): cualquier issuer compliant con
  los flujos D2/D3 debe funcionar sin cambio de código.
- **D2 — Humanos: Authorization Code flow + PKCE**, con cookies de sesión HTTP-only de Payload
  tras validar el token (la app es server-rendered; no hay SPA separada que sufra intercepción de
  código). Los claims del ID/access token (`sub`, `iss`, `groups`/`roles`) resuelven la identidad
  y los roles de aplicación.
- **D3 — Agentes: client credentials grant** (OAuth 2.0, RFC 6749 §4.4) para M2M: cada agente es
  un client confidencial con su propio `client_id`/`client_secret` y obtiene access tokens
  cortos; sin refresh tokens en este flujo. El agente **nunca** usa credenciales de un humano
  (REQ-002.1).
- **D4 — Actor type como claim de primera clase.** El rol de aplicación se deriva de claims del
  token (`groups`/`roles`) con mapping explícito a un enum cerrado `AppRole` (`superadmin`,
  `human`, `agent`); el tipo de actor (`human|agent`) es un campo persistido en la identidad de
  Payload, no inferible del token en caliente a posteriori. El mapping es configuración, no código:
  cambiar de provider no exige tocar las ACLs.
- **D5 — readVersions exclusivo de humanos; restore igual.** La ACL `readVersions` de las tres
  colecciones y la operación de restore (`POST /api/{slug}/versions/:id`) niegan todo rol `agent`,
  sin excepción, cumpliendo REQ-002.4 y el §6 del spec SPC-001. Es tamper-evidence operativa: un
  agente con capacidad de reescribir historia anula el propósito del audit trail.
- **D6 — Provider OIDC mínimo self-bootstrapable solo para dev.** Como **opción de bootstrap en
  desarrollo** (no como elección de proveedor), se documenta el perfil de un provider sin webui,
  arrancable con config estática y clientes pre-declarados (el caso de dex, config-driven y sin
  GUI administrativa), de modo que `docker compose up` en modo dev baste para probar el flujo
  completo sin depender del IdP productivo ya provisionado.
- **D7 — Super-admin como vista/ACL dentro del admin único** (no panel separado): ver sección
  «Super admin recommendation».

## Data Model

El modelo de datos propuesto (contratos TypeScript; las colecciones concretas y `payload-types.ts`
se generan al implementar — este ADR no implementa):

```ts
// ── Tipos de identidad ──────────────────────────────────────────────────────

/** Rol de aplicación (cerrado). Derivado de claims del token en cada login/exchange. */
export type AppRole = 'superadmin' | 'human' | 'agent'

/** Naturaleza del actor, persistida. Conduce las ACLs estructurales (REQ-002.4). */
export type ActorType = 'human' | 'agent'

/** Canal de entrada, para atribución inequívoca (REQ-002.2). */
export type AuthChannel = 'webui' | 'mcp' | 'rest'

/** Identidad externa OIDC: el par (iss, sub) es la clave única e inmutable del actor. */
export interface OidcIdentity {
  /** Issuer Identifier del token (https, exacto tal como lo emite el provider). */
  iss: string
  /** Subject del token, único dentro del issuer. */
  sub: string
  /** Grupos/roles crudos recibidos en el login (auditoría del mapping). */
  rawGroups: string[]
}

/** Documento de la colección auth-enabled `users` (Payload). */
export interface LocalPmUser {
  id: string
  email?: string            // los agentes M2M pueden no tener email real
  name?: string
  actorType: ActorType      // 'human' | 'agent' — no se deriva en caliente
  roles: AppRole[]          // derivado de claims por el mapping D4
  identity: OidcIdentity | null  // null solo en migración temporal (fase 1 → 2)
  active: boolean           // kill-switch local sin esperar al IdP
  // Campos auth nativos de Payload (hash/salt/email) presentes según estrategia
}

/** Claims mínimos que la app exige poder leer del token (config por provider). */
export interface OidcClaimsMapping {
  groupsClaim: string       // p.ej. 'groups' | 'roles' | 'local_pm_roles'
  roles: Record<string, AppRole>  // claim value → AppRole (config, no código)
  superAdminGroup: string   // grupo que mapea a 'superadmin'
  agentClientIds: string[]  // client_id que la app reconoce como actores agente
}

/** Resolución de actor para una request autenticada (lo que verán las ACLs). */
export interface AuthenticatedActor {
  user: LocalPmUser
  roles: readonly AppRole[]
  isAgent: boolean          // azúcar de `roles.includes('agent')` para ACLs
  channel: AuthChannel      // webui | mcp | rest — estampado en auditoría
}
```

Cambios de fondo respecto del modelo 1+1 de ADR-001/REQ-002:

1. **Linkage `(iss, sub)`**: la unicidad del actor pasa a ser `(identity.iss, identity.sub)`
   (índice único compuesto en Mongo). El email deja de ser la clave de identidad; es un atributo.
2. **De 1+1 a N+N**: nada en el modelo acota la cantidad de `LocalPmUser`; el «single master» de
   ADR-001 pasa a ser caso particular (el primer usuario provisto, rol `superadmin` o `human`
   según decisión de provisionamiento — ver Open questions). La unicidad y distinción de
   credenciales de REQ-002.1 se conserva: cada actor tiene su client/identidad propia.
3. **Roles derivados, tipo persistido**: `roles` se re-deriva del token en cada autenticación
   (revocación efectiva al expirar el token), pero `actorType` es persistido: las garantías
   estructurales de REQ-002.4 no dependen de que el IdP emita o no un claim en un momento dado.
4. **Atribución**: el par `(actor, channel)` queda disponible en `req.user` + `req` para que el
   módulo de audit trail (SPC-001, gap G-1) estampe autor y canal sin ambigüedad (REQ-002.2).

## ACL mapping

Mapa normativo REQ-002.4 / SPC-001 §6 → roles propuestos:

| Operación (Payload) | `agent` | `human` | `superadmin` | Norma |
|---|---|---|---|---|
| `read` (projects/teams/tickets) | ✓ | ✓ | ✓ | REQ-002.1 (identificado) |
| `create/update/delete` (colecciones de negocio) | ✓ | ✓ | ✓ | REQ-002.1 |
| `readVersions` (GET `/api/{slug}/versions*`) | **✗ DENIED** | ✓ | ✓ | REQ-002.4, SPC-001 §6 |
| Restore (`POST /api/{slug}/versions/:id`) | **✗ DENIED** | ✓ | ✓ | REQ-002.4, SPC-001 §6 |
| `admin` (acceso al Admin Panel) | ✗ | ✓ | ✓ | Decision D7 |
| Gestión de `users` (invitar, activar/desactivar) | ✗ | ✗ | ✓ | Boundary de administración |
| Mapping de claims → roles (config) | — | — | — | Decision D4 |

Notas:

- La denegación al agente es **por policy (ACL), no por convención**: con credencial de agente
  válida, `readVersions` y restore responden denegado. SPC-001 §7.7 ya exige ese test.
- Con boundaries por grupos (fase 3, Migration path), `read` de colecciones de negocio puede
  devolver **query constraints** (Payload soporta devolver una query en lugar de boolean,
  restringiendo documentos por grupo del actor) en lugar de `true` global.
- `create/update/delete` de negocio sigue permitido a agentes: es su función (mutaciones de
  tickets/projects/teams por MCP/REST, REQ-002 «Modelo de provisionamiento»). La línea divisoria
  es la historia, no la operación.

## Code impact

Áreas de cambio identificadas (sin implementar):

1. **Estrategia de autenticación en Payload.** Payload 3.x soporta colecciones auth-enabled con
   estrategias custom (`auth.strategies`, `authenticate` que recibe headers y devuelve el usuario
   de Payload o null) y `disableLocalStrategy` cuando la estrategia nativa email/password no se
   usa. Propuesta: colección `users` auth-enabled con estrategia OIDC que valida el token
   (firma vía JWKS del issuer, `iss`, `aud`, expiración) y resuelve `AuthenticatedActor`; se
   conserva el flujo de cookies HTTP-only de Payload para la sesión del admin.
   Alternativa integradora: plugin comunitario `payload-plugin-oidc` existe (sign-in con provider
   propio, botón en login, creación opcional de usuario, callback configurable), pero su alcance
   cubre el login humano y no el client-credentials de agentes ni el mapping de roles de este
   ADR; su mantenimiento y compatibilidad con Payload 3.x deben evaluarse en implementación.
2. **Endpoints de callback / exchange** (rutas Next.js server-side): authorization code + PKCE
   para humanos; validación de bearer token para M2M.
3. **MCP server**: añadir flujo client credentials (token endpoint del issuer, cache del token
   hasta expiración, `Authorization: Bearer` en cada fetch). Hoy usa `LOCAL_PM_URL` a secas.
4. **ACLs**: reemplazar `access: () => true` por las funciones del «ACL mapping»; añadir
   `readVersions` explícito cuando SPC-001 introduzca `versions: true`.
5. **Admin UI login**: botón/redirect «Sign in con <issuer>» en la vista de login del admin
   (Payload permite customizar vistas y componentes del admin); los agentes no acceden al admin.
6. **Tipado**: interfaces del «Data Model» en `src/types/`; `payload-types.ts` regenerado al
   añadir la colección auth-enabled.

## DB impact

- **Nueva colección auth-enabled `users`** (Payload auth: campos `hash`/`salt`/`email` nativos
  según estrategia). Documentos: shape `LocalPmUser`.
- **Índices**: único compuesto `(identity.iss, identity.sub)`; único en `email` cuando exista;
  índice en `actorType` para consultas administrativas.
- **Colecciones `_slug_versions`** (futuras, SPC-001): sin cambio por este ADR; su ACL
  `readVersions` es la que queda restringida.
- **Migración de datos existentes**: hoy no hay usuarios; no hay backfill de identidad. El
  bootstrap crea el/los primeros usuarios (fase 1 del Migration path). Payload genera el schema
  (colecciones Mongo se crean en primera escritura); no se requieren scripts de migración de
  datos, solo el provisionamiento inicial.

## Migration path

Fases propuestas (incrementales, cada una deja el sistema coherente):

1. **Fase 0 — hoy**: `access: () => true` en todo; sin auth; sin atribución.
2. **Fase 1 — dos identidades sobre OIDC (cumple REQ-002 en su forma 1+1):** issuer OIDC
   parametrizable; se provisionan exactamente dos identidades (master user humano por code+PKCE;
   master agent user por client credentials). ACLs del «ACL mapping» activas (agentes sin
   versions/restore). ADR-001 D2 se satisface con el nuevo mecanismo.
3. **Fase 2 — N humanos / N agentes:** alta de identidades adicionales (humanos invitados;
   un client credentials por agente, cada uno su identidad). Sin cambio de esquema: el modelo
   (iss, sub) ya es N-compatible. Boundaries por grupos activables aquí: grupos del IdP →
   query constraints en `read` por colección (p. ej. un grupo `team-x` solo ve sus proyectos).
4. **Fase 3 — super-admin y administración de identidades:** rol `superadmin` gestiona `users`
   (alta/baja/desactivación), revisa el mapping de claims y audita la atribución. La app nunca
   fue multi-tenant y no lo será en esta fase (ADR-001 non-goals intactos).

El orden garantiza que REQ-002.1–.4 quedan cumplidos desde la fase 1, y que las fases 2–3 son
extensiones de población y administración, no rediseños.

## Super admin recommendation

**Recomendación: admin único con ACL/condicionales por rol `superadmin` (admin tab / vistas
custom), NO panel separado.** Fundamento:

1. **Payload ya da el mecanismo**: el acceso al Admin Panel se gobierna con la función `admin`
   de las colecciones auth-enabled, y las vistas/capacidades se condicionan por rol (custom views,
   componentes que ocultan o muestran según `req.user`). Un segundo admin implicaría un segundo
   config de Payload o un gates proxy delante — más superficie, más despliegue, cero ganancia
   para una app loopback-first.
2. **Escala del caso**: local-pm es local-first con un puñado de identidades. La separación
   física de panel tiene sentido cuando hay operadores que no deben ni conocer la existencia del
   plano administrativo; aquí el mismo operador es super-admin.
3. **Coste de reversión**: si algún día creciera, elevar la vista de administración a ruta propia
   es un refactor acotado; fusionar dos paneles duplicados, no.
   Forma concreta propuesta: vista custom del admin (`/admin/identity`, por ejemplo) — listado de
   `users`, activar/desactivar, ver mapping de claims vigente — visible solo con rol `superadmin`
   (y protegida server-side, no solo oculta en UI: las custom views de Payload son públicas por
   defecto si no se aseguran).

## Alternatives considered

| Alternativa | Veredicto |
|---|---|
| **Status quo (sin auth)** | Rechazada: viola REQ-002.1–.3 con datos productivos; atribución nula. |
| **Auth embebida Payload (email/password + API keys, sin OIDC)** | Seria y simple: `auth` nativo + `useAPIKey: true` para el agente (Authorization: `<slug> API-Key <key>`), cumple 1+1 y el ACL mapping con menos piezas. **Razones para preferir OIDC**: (a) dirección del operador hacia estándar probado y delegación de credenciales a un IdP; (b) MFA/passkeys/federación quedan del lado del provider; (c) N humanos sin gestionar passwords en la app; (d) revocación por token corto frente a API keys no expirantes. Queda registrada como fallback legítimo si el provider OIDC se considera excesivo para la fase 1. |
| **NextAuth/Auth.js (o Better Auth) como capa delante de Payload** | Viable y popular, pero introduce un segundo runtime de auth con su propio session store y dos fuentes de verdad de identidad que sincronizar (adapter custom hacia `users` de Payload). La estrategia custom nativa de Payload logra lo mismo dentro de un solo modelo (el usuario validado es un documento Payload desde el primer momento). Rechazada por duplicación, no por incapacidad. |
| **Plugin comunitario `payload-plugin-oidc`** | Cubre login humano con provider propio y creación de usuario, pero no client credentials para agentes ni el actor-type/roles mapping de este ADR. Evaluarse como base o referencia en implementación; no adoptado como decisión. |
| **Panel de super-admin separado** | Rechazada: ver «Super admin recommendation». |
| **Elegir provider OIDC ahora (keycloak/authentik/zitadel/dex/…)** | Fuera de alcance por diseño del encargo: el ADR fija el *contrato* (issuer parametrizable, flujos estándar, claims mapeables); el provider es sustituible. Dex se menciona solo como *perfil de bootstrap dev* (config-driven, sin webui), no como elección. |
| **Agentes con usuario humano compartido** | Rechazada: viola REQ-002.1 y destruye la atribución (REQ-002.2/.3). |

## Open questions

1. **Provider dev para el bootstrap**: perfil dex (config estática, sin webui, contenedor único)
   frente a alternativas igual de headless. Decisión de implementación, no de este ADR.
2. **¿El primer humano provisionado es `superadmin` o `human`?** Propuesta por defecto:
   `superadmin` (fase 3 necesita dueño desde el día uno), a confirmar por el operador.
3. **¿Los agentes se representan como clients M2M del IdP (tokens sin usuario) o como documentos
   `users` con `actorType: 'agent'` + client credentials?** Propuesta: ambos a la vez (client en
   el IdP + documento espejo con roles y `active`), para poder desactivar localmente sin tocar el
   IdP. A confirmar.
4. **Boundaries por grupos: ¿lectura por query constraint desde fase 2, o global hasta nueva
   decisión?** Propuesta: global (todos los identificados leen todo) en fase 1–2; constraints por
   grupo cuando exista la primera necesidad real.
5. **Refresh tokens de humanos**: cookies de sesión con expiración corta + auto-refresh del admin
   frente a refresh tokens del provider. Detalle de implementación.

## Verification criteria

Este ADR se verifica (cuando se implemente) si:

1. Toda mutación sin credenciales es rechazada (401) en REST, MCP y admin.
2. Un cambio vía webUI atribuye al humano; uno vía MCP atribuye al agente; ambos quedan
   distinguibles por `(actor, channel)` — requisito SPC-001 §7.7 / REQ-002.2.
3. Con credencial de agente válida: `GET /api/tickets/versions` → denegado; `POST
   /api/tickets/versions/:id` → denegado; el master user obtiene 200 en ambas (REQ-002.4).
4. Cambiar `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` a otro provider compliant no
   exige cambios de código (solo config y mapping de claims).
5. Dos humanos y dos agentes operan simultáneamente con atribución correcta (fase 2).
6. El rol `superadmin` accede a la administración de identidades; `human` no la ve; `agent`
   tampoco y no accede al admin.
7. El modo dev arranca el flujo OIDC completo con el provider de bootstrap sin intervención de
   webui del provider (D6).

## References

Todo lo citado fue leído para este ADR (búsquedas donsetch + fetch de las URLs resultantes;
ninguna URL adivinada):

| Fuente | Qué aportó |
|---|---|
| [Payload — Authentication Overview](https://payloadcms.com/docs/authentication/overview) | Opciones de `auth` en colecciones (`tokenExpiration`, `useAPIKey`, `useSessions`, `disableLocalStrategy`, `strategies`), estrategias nativas (cookies HTTP-only, JWT, API keys) y auto-login de desarrollo. |
| [Payload — Custom Strategies](https://payloadcms.com/docs/authentication/custom-strategies) | Mecánica de una estrategia custom (`authenticate` con `payload`/`headers` → user o null; `disableLocalStrategy: true`), base del Code impact §1. |
| [Payload — API Key Strategy](https://payloadcms.com/docs/authentication/api-keys) | `useAPIKey: true`, header `Authorization: <slug> API-Key <key>`, cifrado de keys en DB, `disableLocalStrategy` para API-key-only; usada en la alternativa «auth embebida». |
| [Payload — Collection Access Control](https://payloadcms.com/docs/access-control/collections) | Funciones `create/read/update/delete/admin/unlock/readVersions` por colección; `readVersions` restringe también la UI de versiones; queries como constraints — base del ACL mapping y de los boundaries por grupos. |
| [Payload — Customizing Views](https://payloadcms.com/docs/custom-components/custom-views) | Custom views del admin (`admin.components.views`), seguro de las mismas (públicas por defecto) — base de la recomendación de super-admin. |
| [payload-plugin-oidc (GitHub, gousta)](https://github.com/gousta/payload-plugin-oidc) | Plugin comunitario OIDC existente: features (sign-in con provider propio, botón de login, creación opcional de usuario, mapping de role desde userinfo) y sus límites frente a este ADR. |
| [dexidp/dex (GitHub)](https://github.com/dexidp/dex) | Dex como OIDC provider federado config-driven; ejemplo de ID token con claims `iss/sub/aud/groups`; tabla de conectores y soporte de `groups` claim — perfil D6 de bootstrap dev. |
| [Pocket ID (GitHub)](https://github.com/pocket-id/pocket-id) | OIDC provider self-hosted mínimo (certificado OIDC, passkeys, docker) — contraste de peso para el bootstrap dev; su webui de administración lo aleja del perfil sin-webui. |
| [oauth.net — Client Credentials Grant](https://oauth.net/2/grant-types/client-credentials/) | Definición del flujo M2M (RFC 6749 §4.4): sin redirect, sin usuario, sin refresh token; tokens cortos — base de D3. |
| [RFC 6749 — The OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/info/rfc6749/) | Marco normativo del grant client credentials citado por oauth.net. |
| [Auth0 — Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce) | Mecánica code+PKCE paso a paso (code_verifier/challenge, id+access token) — base de D2. |
| [Microsoft Entra — client credentials flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow) | Flujo M2M «two-legged», permisos a la aplicación misma, ausencia de refresh tokens, autorización por ACL de client ids — refuerza D3 y el campo `agentClientIds`. |
| [Zitadel — Zitadel vs Keycloak](https://zitadel.com/blog/zitadel-vs-keycloak) | Contraste de providers self-hosted (protocolos soportados, multi-tenancy, audit trail del IdP) — contexto para dejar fuera la elección de provider sin ignorarla. |

Referencias internas: [REQ-002](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md)
(Requerimiento contrastado — modelo de provisionamiento, REQ-002.1–.4, decisión abierta D-R2) ·
[ADR-001](2026-09-05_ADR-001_local-first-loopback-binding.md) (ACCEPTED — loopback-only,
two-identity provisioning, non-goals) · [Spec SPC-001](../specs/2026-09-05_audit-trail-restore-spec.md)
(§6 Access policy normativo; §7.7 verificación de denegación al agente; G-1 atribución de autor) ·
Código: `src/payload.config.ts`, `src/collections/{Projects,Teams,Tickets}.ts` (`access: () => true`),
`mcp-server/` (`LOCAL_PM_URL` sin credenciales).
