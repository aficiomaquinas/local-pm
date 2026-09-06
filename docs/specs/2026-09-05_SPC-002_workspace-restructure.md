# Spec — Workspace restructure (mcp-server as first-class package)

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`) |
| **ID** | SPC-002 |
| **Date** | 2026-09-05 |
| **Status** | DRAFT — pending user review. Spec ONLY: no se ejecuta hasta decisión del usuario (ver D-R3 en REQ-003). |
| **Type** | Spec (cómo se implementa; el qué vive en REQ-003) |
| **Resolves** | [REQ-003 — Repository restructure per best practices (no monkey patching)](../requirements/2026-09-05_REQ-003_workspace-restructure.md) |
| **Related** | [SPC-001 — Audit trail & restore](../specs/2026-09-05_SPC-001_audit-trail-restore.md) · PR anaskasmi/local-pm#1 y commit `99fad97` (stopgap vigente, este spec lo jubila) |
| **Scope driver** | Instrucción del operador (2026-09-05, TODO track): spec de reestructuración basado en investigación real — benchmark propio `mcp-baserow-schema`, referencia oficial `modelcontextprotocol/servers`, docs autoritativas MCP. |

---

## 1. Objetivo

Definir la reestructuración de `local-pm` como workspace JS/TS conforme a best
practices de monorepo, con `mcp-server/` convertido en paquete de primera clase:

- fronteras de paquete explícitas (cada paquete con `package.json` y `tsconfig`
  propios, reconocidos por el workspace manager);
- type-check y build por paquete, aislados; el build de la app deja de arrastrar
  código del MCP server;
- fin del monkey-patching: el exclude `"mcp-server"` en el tsconfig raíz
  (stopgap de `99fad97`) desaparece porque deja de tener objeto — la inclusión
  por glob `**/*.ts` del root desaparece con él.

Este spec NO implementa nada: es el plan de ejecución para cuando el operador
resuelva D-R3 (momento de ejecución).

## 2. Evidencia del estado actual (verificada en el repo, 2026-09-05)

| Hecho | Evidencia |
|---|---|
| Root tsconfig incluye todo el árbol por glob | `tsconfig.json`: `"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]` |
| Stopgap vigente | mismo archivo: `"exclude": ["node_modules", "mcp-server"]` (commit `99fad97`, PR anaskasmi/local-pm#1) |
| Paquete anidado no integrado | `mcp-server/package.json` (`@local-pm/mcp-server`) y `mcp-server/tsconfig.json` propios, con **lockfile propia** (`mcp-server/package-lock.json`) ajena al root |
| Sin workspace | `package.json` raíz no declara `workspaces`; no existe `pnpm-workspace.yaml`; el manager vigente es npm (`package-lock.json` raíz) |
| Sin filtración hoy, por parche | el build Docker (`99fad97`) pasa porque el exclude saca `mcp-server` del type-check; antes del parche, build exit 1 (`9848720`) |
| Docker ignora el subpaquete | `Dockerfile` copia solo el `package.json` raíz y hace `npm ci`; `mcp-server` entra al image por el `COPY . .` sin build ni uso |
| Calidad del paquete MCP | un solo archivo `src/index.ts` (1084 líneas), API de bajo nivel `Server` del SDK, `@modelcontextprotocol/sdk ^1.0.0`, sin `files`/`exports`/`engines` en el manifest |

La causa de fondo (REQ-003) no es el exclude: es que el repo es **dos paquetes
disfrazados de uno** — el glob del root era la única "frontera", y era falsa.

## 3. Hallazgos de investigación

Metodología: web search semántica primero (donsetch), fetch solo de URLs
resultantes de esas búsquedas. Toda afirmación externa lleva cita en §8.

### 3.1 Cómo estructuran su monorepo los reference servers MCP oficiales

- El repo `modelcontextprotocol/servers` es un monorepo **npm workspaces**: el
  `package.json` raíz declara `"workspaces": ["src/*"]` (cada server es un
  directorio bajo `src/`), el root es `"private": true` y actúa solo como
  orquestador — nunca se publica. Existe UNA lockfile unificada
  (`package-lock.json`) para todo el repo ([2], [3]).
- Cada server es a la vez workspace member y paquete distribuible autónomo:
  manifest propio con `"type": "module"`, `bin`, `files`, hook `prepare`, y su
  dependencia explícita del SDK (`@modelcontextprotocol/sdk`). Los TS servers
  se publican como `@modelcontextprotocol/server-*` y se ejecutan con
  `npx -y @modelcontextprotocol/server-memory`; los Python van a PyPI y se
  corren con `uvx` ([2], [3]).
- Orquestación de build desde el root con `npm run build --workspaces`: el
  comando ejecuta el `build` de cada workspace member; el root además fija
  `overrides` de dependencias transitivas compartidas ([2]).
- El propio README advierte que estos servers son **reference implementations
  educativas, no production-ready**: son ejemplo de estructura, no de
  hardening ([3]).
- El repo del TypeScript SDK oficial (`modelcontextprotocol/typescript-sdk`) es
  también un monorepo, pero gestionado con **pnpm** (`pnpm-workspace.yaml`,
  `pnpm-lock.yaml`), con paquetes bajo `packages/` y ejemplos bajo `examples/`;
  publica paquetes separados (`@modelcontextprotocol/server` y `.../client`,
  línea v2, spec MCP 2026-07-28) ([4]).

**Lectura para local-pm:** el patrón canónico MCP es "root privado orquestador
+ un directorio de paquetes + un paquete por server con manifest completo +
run vía `npx`". Ambos repos de referencia coinciden en la forma; difieren solo
en el manager (npm en servers, pnpm en el SDK).

### 3.2 Qué aplica bien de `mcp-baserow-schema` (benchmark propio) y qué falta en el paquete actual

`mcp-baserow-schema` (v2.0.2, publicado en npm con CI) es un paquete MCP
autónomo convencional (inspección directa, repo local, solo lectura):

| Convención del benchmark | Estado en `mcp-server/` de local-pm | Fuente de la convención |
|---|---|---|
| `bin` apuntando a `dist/index.js` con shebang `#!/usr/bin/env node` | ✓ presente (bin `local-pm-mcp`) | [5] (docs MCP: bin + build con `chmod 755`) |
| `files: ["dist", …]` — solo se publica lo compilado | ✗ ausente | [2], [5] |
| `engines: { node: ">=20" }` | ✗ ausente (root de la app sí tiene engines) | [5] (Node 20+ requisito de los docs MCP TS) |
| `tsconfig` aislado: `NodeNext`/`NodeNext`, `outDir dist`, `rootDir src`, `include: ["src/**/*"]` | ✓ presente e idéntico en sustancia | [2], [5] |
| `src/` modular (index/api/auth/spec/totp) | parcial: un solo archivo de 1084 líneas | práctica general del benchmark |
| SDK actualizado (`^1.12.1`) y API high-level `McpServer` | `^1.0.0` y API low-level `Server` | [4] (SDK v2 publicado; 1.x en mantenimiento) |
| Release automatizado: release-it + Conventional Commits, OIDC trusted publishing, `server.json` (`mcpName`) para el MCP Registry, `docs/RELEASING.md` | inexistente (no publica) | benchmark local; patrón también documentado en [3] (RELEASING.md del repo oficial) |

**Conclusión 3.2:** el tsconfig aislado del paquete local ya es correcto; lo
que falta es la **frontera de workspace** (que nadie lo incluya por accidente)
y los campos de manifest que lo harían instalable/ejecutable como paquete
(`files`, `engines`, `exports`, permiso de ejecución del bin).

### 3.3 Workspace manager: npm vs pnpm

Comparativa contrastada sobre fuentes §8 ([6], [7]):

| Dimensión | npm workspaces | pnpm workspaces |
|---|---|---|
| Definición | campo `workspaces` en root `package.json` | `pnpm-workspace.yaml` |
| Modelo de install | `node_modules` tradicional, **hoisted por default** — el hoisting permisivo puede ocultar dependencias no declaradas ("phantom dependencies") | `node_modules` symlinked sobre store content-addressable; **estricto por default**: un paquete solo ve lo que declara |
| Lockfile | `package-lock.json` | `pnpm-lock.yaml` única en root (`sharedWorkspaceLockfile`: cada dependencia es singleton, installs más rápidos) |
| Filtrado de tasks | `--workspace`/`--workspaces`, modelo simple | `--filter` graph-aware (por nombre, dependientes, etc.) |
| Posición declarada | "optimiza compatibilidad y bajo cambio de proceso" | "optimiza corrección, eficiencia y operaciones de monorepo a escala" ([6]) |
| Precedente MCP | repo `servers` ([2]) | repo `typescript-sdk` ([4]) |

**Decisión D-SPC2-1 — pnpm workspaces.** Justificación:

1. El requisito duro de REQ-003.2 es frontera explícita y cero dependencias
   cruzadas implícitas. El modo de falla que rompió el build (`9848720`) es
   exactamente el phantom dependency / filtración que el hoisting de npm
   tolerantiza y pnpm hace estructuralmente imposible ([6]): con pnpm, el app
   no puede "ver" el código de `packages/mcp-server` salvo que declare
   dependencia — y este spec declara que NO la declare (ver D-SPC2-3).
2. La toolchain ya está en la máquina: pnpm 11.x es el manager global del
   entorno del operador (gestionado vía ASDF) — cero instalación nueva.
3. Precedente en el ecosistema MCP: el SDK oficial TypeScript usa pnpm ([4]).
4. Costo honesto: migración de lockfile (npm→pnpm, §5 paso 5) y ajuste del
   Dockerfile (corepack). Alternativa npm workspaces fue evaluada y descartada:
   menor churn inmediato, pero re-introduce el modelo permisivo que hizo
   posible el bug original, y su filtrado/strictness es inferior para el
   objetivo declarado del REQ ([6], [7]).

### 3.4 TypeScript: por qué NO hace falta project references aquí

- Un tsconfig raíz con glob + `paths` trata todo el monorepo como **una sola
  unidad** sin fronteras reales; `references` + `composite` + `tsc -b` es el
  mecanismo TS para convertirla en "islas" con builds orquestados ([8]).
- En este repo los dos paquetes **no comparten tipos**: la interfaz app ↔ MCP
  es el contrato REST/HTTP (`LOCAL_PM_URL`), no un import. Sin `references`
  cruzadas no hay nada que orquestar con `composite`; cada paquete compila con
  su propio `tsc` y la app (Next.js) maneja su propia compilación.
- Se deja documentado: si en el futuro un paquete compartido (p. ej. tipos del
  contrato API) se extrae, ese paquete sí llevará `composite: true` y será
  `referenced` por los que lo consuman ([8]).

## 4. Diseño propuesto

### 4.1 Estructura target de directorios

```
local-pm/
├── package.json               # root: private, SIN deps de app; scripts orquestadores
├── pnpm-workspace.yaml        # packages: ["apps/*", "packages/*"]
├── pnpm-lock.yaml             # ÚNICA lockfile del repo
├── .npmrc                     # (si hace falta) public-hoist-pattern para tooling Next que asuma flat node_modules
├── tsconfig.base.json         # opciones comunes (strict, ES2022, skipLibCheck, …)
├── apps/
│   └── web/                   # la app Next.js 15 + Payload 3.x (ex-raíz: src/, next.config.ts, …)
│       ├── package.json       # name "web" (o @local-pm/web), deps actuales del root
│       └── tsconfig.json      # include SOLO su propio árbol; sin ningún exclude ad-hoc
├── packages/
│   └── mcp-server/            # @local-pm/mcp-server — paquete de primera clase
│       ├── package.json       # completo (§4.4)
│       ├── tsconfig.json      # NodeNext aislado (el actual, extendiendo base)
│       └── src/index.ts       # (sin cambios de código en este spec)
├── Dockerfile                 # multi-stage consumiendo el workspace (§4.5)
├── docker-compose.yml         # sin cambios de forma (build context sigue siendo el root)
└── docs/                      # esta convención; README del fork documenta el workspace
```

El root queda como orquestador privado — el mismo rol que el root del repo
oficial `servers` ([2]) y del SDK ([4]).

### 4.2 Configuración del workspace (pnpm)

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```jsonc
// package.json raíz (orquestador; "private": true)
{
  "name": "local-pm-monorepo",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",                    // orden topológico; hoy app y mcp son independientes
    "dev": "pnpm --filter local-pm-web dev",
    "mcp:build": "pnpm --filter @local-pm/mcp-server build",
    "mcp:dev": "pnpm --filter @local-pm/mcp-server dev",
    "seed": "pnpm --filter local-pm-web seed",
    "start": "pnpm --filter local-pm-web start"
  },
  "engines": { "node": ">=20.9.0", "pnpm": ">=10" }
}
```

### 4.3 tsconfig por paquete + base compartida

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- `apps/web/tsconfig.json`: `extends` la base; conserva `jsx: preserve`,
  `module: esnext`, `moduleResolution: bundler`, plugins Next, `paths`
  (`@/*`, `@payload-config`) — pero el `include` pasa a ser el árbol de la app
  (`include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`
  **dentro de `apps/web/`**). El `exclude: ["mcp-server"]` se ELIMINA: ya no
  existe ningún glob que pueda alcanzar `packages/`.
- `packages/mcp-server/tsconfig.json`: el actual (NodeNext/NodeNext, outDir
  dist, rootDir src) extendiendo la base para las opciones comunes. Sin
  `composite` (§3.4).

### 4.4 Paquete `@local-pm/mcp-server` (manifest de primera clase)

```jsonc
{
  "name": "@local-pm/mcp-server",
  "version": "1.0.0",
  "description": "MCP server for Local PM - Project Management System",
  "type": "module",
  "private": true,                          // hasta decidir publicación (§4.6)
  "main": "dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "bin": { "local-pm-mcp": "dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc && chmod 755 dist/index.js",   // patrón docs MCP oficiales [5]
    "dev": "tsc --watch",
    "start": "node dist/index.js"
  },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.12.1" },
  "devDependencies": { "@types/node": "^22", "typescript": "^5.9" },
  "engines": { "node": ">=20.0.0" }
}
```

Notas: `files`/`exports`/`engines` y el `chmod` del bin siguen los docs
oficiales MCP TS ([5]) y el benchmark propio (§3.2). El bump del SDK de `^1.0.0`
a `^1.12.1` es compatible 1.x; la migración a la línea v2 del SDK
(`@modelcontextprotocol/server`, spec 2026-07-28, [4]) y la refactorización del
mono-archivo a `src/` modular quedan EXPLÍCITAMENTE fuera de este spec (no son
reestructuración).

**Frontera app ↔ MCP (D-SPC2-3):** los dos paquetes NO se declaran dependencia
uno del otro (ningún `"workspace:"` entre ellos). La única interfaz es HTTP
(`LOCAL_PM_URL`, default `http://localhost:3010`). Así la independencia de
builds es estructural, no convencional.

### 4.5 Dockerfile multi-stage consumiendo el workspace

Misma estrategia de capas que hoy, adaptada a pnpm:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/mcp-server/package.json packages/mcp-server/
RUN pnpm install --frozen-lockfile          # capas cacheables por manifest

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY . .
ARG DATABASE_URI
ARG PAYLOAD_SECRET
ARG NEXT_PUBLIC_SERVER_URL
ENV DATABASE_URI=$DATABASE_URI PAYLOAD_SECRET=$PAYLOAD_SECRET \
    NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL \
    NODE_OPTIONS="--no-deprecation --max-old-space-size=8000"
RUN pnpm --filter @local-pm/mcp-server build   # mcp compila aislado (verificación en image)
RUN pnpm --filter local-pm-web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NODE_OPTIONS="--no-deprecation"
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
RUN pnpm --filter local-pm-web deploy --prod /out    # árbol de deps podado del workspace
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next /out/apps/web/.next
# …(ajuste fino de rutas .next/public según layout del deploy)…
USER nextjs
EXPOSE 3010
ENV PORT=3010 HOSTNAME="0.0.0.0"
CMD ["node", "apps/web/node_modules/.bin/next", "start", "--port", "3010"]
```

(El detalle fino del `runner` — `pnpm deploy` vs copia `.next` + `node_modules`
podada — se fija en la implementación; el requisito de diseño es: installs
por-manifest cacheables, `--frozen-lockfile`, y que el stage de build compile
el paquete MCP por separado como verificación de frontera. Un stage opcional
`mcp` puede producir una segunda imagen ejecutable `local-pm-mcp` para correr
el server en-contenedor; con `network_mode` apuntando a la app por la red
interna de compose.)

### 4.6 Versionado y publicación (opcional, no bloqueante)

Hoy el paquete es `private`. Si el operador decide publicarlo, el template es
el propio `mcp-baserow-schema`: `files`/`engines`/`repository` ya quedaron en
el manifest (§4.4); agregaría release-it + Conventional Commits, npm trusted
publishing (OIDC) y `server.json` con `mcpName` para el MCP Registry, con su
`docs/RELEASING.md` — sin cambios estructurales adicionales (§3.2). Nota: el
scope `@local-pm` requiere ser propietario del scope en npm, o renombrar a un
nombre no-scoped. Decisión diferida; no forma parte del acceptance criteria.

## 5. Plan de migración (por pasos — NO ejecutar; requiere D-R3)

1. **Prerrequisito:** decisión D-R3 del operador (timing vs merge de PR #1 y
   SPC-001). Este spec no se ejecuta sin ella (REQ-003.4).
2. `git mv` de la app a `apps/web/` (src/, next.config.ts, postcss, seeds,
   public) y de `mcp-server/` a `packages/mcp-server/`. Commits separados,
   cada uno con build verde.
3. Crear `pnpm-workspace.yaml`; reescribir el `package.json` raíz como
   orquestador (§4.2); mover las deps de la app al manifest de `apps/web`.
4. Crear `tsconfig.base.json`; ajustar `apps/web/tsconfig.json` (include propio,
   SIN exclude mcp-server) y `packages/mcp-server/tsconfig.json` (extends base).
5. Migración de lockfile: `pnpm import` desde los dos `package-lock.json`
   (root y `mcp-server/`) → generar `pnpm-lock.yaml` única → borrar ambos
   `package-lock.json` → `pnpm install` completo y auditoría de arranque.
6. Actualizar el manifest de `packages/mcp-server` (§4.4) y verificar
   `pnpm --filter @local-pm/mcp-server build` + arranque del bin.
7. Reescribir `Dockerfile` (§4.5); validar `docker compose up -d --build`.
8. Documentar el workspace en el README del fork (Verificación de REQ-003) y
   actualizar `docs/` si algún xref de código cambió de ruta.
9. Ejecutar §7 completo; marcar REQ-003 `IMPLEMENTED` solo con todo verde.

Rollback: la migración es un conjunto de commits revertibles; mientras no se
ejecute el paso 4, el stopgap vigente (`99fad97`) sigue siendo la mitigación
aceptada (REQ-003.3).

## 6. Impactos y riesgos

| Impacto / riesgo | Mitigación |
|---|---|
| Cambio de manager npm→pnpm para humanos y CI | pnpm ya está en la toolchain del operador (ASDF); `pnpm import` semilla la lockfile; CI: `pnpm install --frozen-lockfile` |
| Docker image ahora necesita pnpm (corepack) | `corepack enable` en stage base (§4.5); imagen base no cambia (node:20-alpine) |
| Next.js/pnpm: tooling que asume `node_modules` flat puede fallar | `.npmrc` con `public-hoist-pattern[]` selectivo — hoisting quirúrgico, no el default permisivo de npm |
| Migración de lockfile no 1:1 | paso 5 con `pnpm import` + install completo + smoke test antes de seguir |
| Rebase friction en branches vivas (rutas movidas) | ejecutar D-R3 en ventana sin branches activas; commits de reestructura separados y atómicos |
| El paquete MCP hoy es un mono-archivo con SDK viejo | fuera de alcance a propósito (§4.4); la reestructura no lo empeora y deja la puerta lista |
| `pnpm deploy` del runner tiene detalle fino de rutas | detalle fijable en implementación; requisito de diseño explícito en §4.5 |

## 7. Acceptance criteria (alineados a Verificación de REQ-003)

1. `docker compose up -d --build` verde, y el tsconfig de la app **no contiene
   ningún exclude de `mcp-server`** (el campo desaparece, no se relaja).
2. `pnpm --filter @local-pm/mcp-server build` compila el paquete de forma
   aislada; `node packages/mcp-server/dist/index.js` arranca y responde al
   handshake MCP (initialize) contra la app local.
3. Aislamiento estructural demostrable: el `include` de `apps/web/tsconfig.json`
   no alcanza `packages/` (sin glob de repo completo); `grep -r mcp-server
   apps/web` no produce references de build/type-check.
4. Cero dependencias cruzadas implícitas: ningún `workspace:` entre app y mcp
   en los manifests; el único acoplamiento declarado es `LOCAL_PM_URL` (HTTP).
5. Una sola lockfile en el repo (`pnpm-lock.yaml` en root); no existen
   `package-lock.json` anidados.
6. El bin es ejecutable como paquete: shebang presente, permiso 755 post-build,
   `pnpm --filter @local-pm/mcp-server exec local-pm-mcp --help` (o arranque
   directo) funciona — requisito `npx`-readiness de la forma canónica MCP ([3]).
7. El README del fork documenta la estructura de workspace (tercer punto de
   Verificación de REQ-003).
8. Sin regresión funcional: board/projects/teams y el MCP server operan
   idénticos (los tools no cambian; solo la envoltura del repo).

## 8. References

Investigación 2026-09-05 — metodología: web search (donsetch) primero, fetch
solo de URLs resultado de búsqueda. Benchmark local inspeccionado solo lectura.

Externa (URL + título):

1. https://github.com/modelcontextprotocol/servers — *Model Context Protocol
   servers* (README oficial: reference implementations educativas, uso `npx`
   de TS servers / `uvx` de Python, SDKs por lenguaje, RELEASING.md OIDC).
2. https://deepwiki.com/modelcontextprotocol/servers/1.2-server-types-and-capabilities
   — *Repository Structure and Package Management (modelcontextprotocol/servers)*
   (npm workspaces `src/*`, root `private`, lockfile unificada, manifests por
   server con `bin`/`files`/`prepare`, `npm run build --workspaces`,
   `@modelcontextprotocol/server-*`, `mcpName`).
3. https://github.com/modelcontextprotocol/servers — ídem [1] (fetch directo
   del README: warning "not production-ready", tabla de reference servers).
4. http://github.com/modelcontextprotocol/typescript-sdk — *MCP TypeScript SDK*
   (monorepo pnpm: `pnpm-workspace.yaml`/`pnpm-lock.yaml`, paquetes en
   `packages/`, split packages v2 `@modelcontextprotocol/server`/`client`,
   spec 2026-07-28, v1.x en mantenimiento).
5. https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server —
   *Build an MCP server — Model Context Protocol* (requisitos Node 20+,
   `package.json` con `type: module`/`bin`/`files`, `build: tsc && chmod 755`,
   tsconfig Node16 estricto, nunca escribir a stdout en servers STDIO).
6. https://stevekinney.com/courses/enterprise-ui/workspace-package-managers —
   *npm vs pnpm vs Bun: Workspace Package Managers* (npm = compatibilidad/bajo
   cambio de proceso y hoisting permisivo con phantom deps; pnpm = corrección,
   store content-addressable, strictness, `--filter`; tabla comparativa y
   failure modes).
7. https://pnpm.io/workspaces — *Workspace | pnpm* (`pnpm-workspace.yaml`,
   protocolo `workspace:`, `sharedWorkspaceLockfile` — dependencias singleton
   con strictness preservada, `linkWorkspacePackages`).
8. https://nx.dev/blog/typescript-project-references — *Everything You Need to
   Know About TypeScript Project References* (glob + `paths` en root = una sola
   unidad sin fronteras; `references` + `composite` + `tsc -b` = islas
   orquestadas).

Local (inspección directa, sin URL):

- `~/Documents/DevelopmentV2/mcp-baserow-schema` @ 2.0.2 (solo lectura):
  `package.json` (bin/files/engines/repository), `tsconfig.json` NodeNext
  aislado, `src/` modular, release-it + `.release-it.json`,
  `.github/workflows/publish-mcp.yml` (OIDC trusted publishing + MCP
  Registry), `server.json` (`mcpName`), `docs/RELEASING.md`.
- `local-pm` (evidencia §2): `package.json`, `tsconfig.json`,
  `mcp-server/{package.json,tsconfig.json,src/index.ts,README.md}`,
  `Dockerfile`, commits `9848720`/`99fad97`/`05dab27`.
