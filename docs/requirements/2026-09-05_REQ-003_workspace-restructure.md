# REQ-003 — Repository restructure per best practices (no monkey patching)

| | |
|---|---|
| **ID** | REQ-003 |
| **Date** | 2026-09-05 |
| **Status** | DRAFT — pending review. Sin commit. Requirement ONLY: no se ejecuta hasta decisión del usuario. |
| **Type** | Requirement |
| **Related** | PR anaskasmi/local-pm#1 (stopgap vigente) · `mcp-server/` · `tsconfig.json` |

---

## Estado actual (evidencia, 2026-09-05)

- `mcp-server/` vive como paquete anidado dentro del repo de la app Next.js, con `package.json`/`tsconfig.json` propios no integrados a un workspace.
- Colisión real documentada: el `**/*.ts` del tsconfig raíz arrastraba `mcp-server/src` al type-check del build (prueba: build Docker exit 1 en `9848720`; fix en PR #1).
- PR anaskasmi/local-pm#1 (`fix: exclude mcp-server from Next.js type-check`) es correcto como PATCH y aceptado como stopgap, pero ataca el síntoma, no la estructura: la causa de fondo es la frontera de paquete mal definida.
- Las dependencias del subpaquete no resuelven de forma confiable en el contexto del build de la app (evidencia: el propio error del build).

## Requerimiento

- **REQ-003.1:** Reestructurar el repositorio conforme a best practices de monorepo JS/TS (workspace manager — npm/pnpm workspaces —, fronteras de paquete explícitas, type-check y build por paquete, tooling compartido donde aplique), investigando lo necesario antes de ejecutar.
- **REQ-003.2:** El MCP server debe ser un paquete de primera clase: build independiente reproducible, sin filtrarse en el type-check/build de la app, sin dependencias cruzadas implícitas.
- **REQ-003.3:** Prohibido monkey patching como solución final: el patch del PR #1 queda como mitigación temporal vigente hasta que REQ-003 se implemente.
- **REQ-003.4:** Este rework permanece como REQUIREMENT ONLY a la fecha — sin agenda de ejecución hasta decisión del usuario (ver D-R3).

## Verificación

- `docker compose up -d --build` verde sin ningún exclude ad-hoc en el tsconfig raíz.
- Build del MCP server ejecutable de forma aislada desde su paquete.
- Estructura de workspace documentada en el README del fork.

## Decisión pendiente del usuario

| ID | Decisión |
|---|---|
| D-R3 | Momento de ejecución de REQ-003 (post-merge del PR #1 y del módulo audit trail, u orden distinto) |
