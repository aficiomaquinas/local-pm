# Spec — Audit Trail & Restore (Payload Native Versions)

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`) |
| **ID** | SPC-001 |
| **Status** | DRAFT — pending user review. |
| **Date** | 2026-09-05 |
| **Depends on** | PR anaskasmi/local-pm#1 (`fix/tsconfig-exclude-mcp-server`) — build base |
| **Related** | [REQ-002 — distinguished actor credentials & role policy](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · [ADR-001](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md) |
| **Scope driver** | Item 100001-adjacent del TODO (`~/.hermes/profiles/ttamayo/todo/TODO.md`); función: audit trail filtrable + restore, sobre `versions: true` nativo de Payload |

---

## 1. Objetivo

Agregar a `local-pm` un módulo de **audit trail + rollback** para las tres colecciones
(`projects`, `teams`, `tickets`), usando exclusivamente el mecanismo nativo
[Versions de Payload CMS](https://payloadcms.com/docs/versions/overview)
(`versions: true`, drafts deshabilitados). Sin motores de versionado externos
(Dolt/TerminusDB/immudb quedan fuera de este spec), sin event sourcing custom.

La superficie visible es una **nueva tab del frontend** ("nombre por definir", working
name `History`): un log de auditoría filtrable por parámetros, donde cada entrada es
inspeccionable (diff campo por campo contra el estado previo/siguiente) y restaurable
en un click.

## 2. Fundamento técnico (verificado contra docs Payload 3.x)

Lo que `versions: true` provee nativamente — el spec se construye sobre esto y nada más:

1. **Auto-scaffold de colecciones `_slug_versions`** (`_projects_versions`,
   `_teams_versions`, `_tickets_versions`). Cada documento de versión almacena:
   `{ _id, parent, autosave, version: {…doc completo…}, createdAt, updatedAt }`
   (docs: *Database impact*).
2. **Snapshot por update** (modo *versions enabled, drafts disabled*): "Payload will
   simply create a new version of a document each time you update a document… any
   changes should *always* be treated as published". Coincide con el modelo de local-pm
   (no hay flujo editorial ni borradores).
3. **Operaciones expuestas por REST** (docs: *Version operations*), que la nueva tab
   consume sin escribir backend propio:

   | Method | Path | Uso en el módulo |
   |---|---|---|
   | GET | `/api/{slug}/versions?where=…&sort=-updatedAt&page=…&limit=…` | feed del audit trail (query `where` nativo = filtros) |
   | GET | `/api/{slug}/versions/:id` | detalle de una entrada |
   | POST | `/api/{slug}/versions/:id` | **restore** (rollback de un click) |

4. **Diff visual:** el propio Admin UI de Payload ya renderiza diffs entre versiones
   (docs: *"view diffs in order to see exactly what has changed… and when"*). La nueva
   tab reutiliza el mismo dato (versión N vs N-1 comparadas por `parent` y fecha) con un
   render propio: la librería candidata es **jsondiffpatch** (diff estructural, HTML
   diff, patch/unpatch) — evaluación en §6.
5. **Autor de cada cambio:** las versiones guardan el snapshot pero el campo de autor
   depende del pipeline de versiones; ver gap G-1.
6. **Access control:** las versiones heredan `readVersions`/`versions` ACL. local-pm hoy
   tiene `access: read/create/update/delete: () => true` en las 3 colecciones →
   con esto las versiones quedan **públicas de facto** vía REST. Gap G-3.

## 3. Alcance

### In scope
1. `versions: true` en `Projects`, `Teams`, `Tickets` (+ `maxPerDoc` — §5.2).
2. Nueva tab frontend `History` (App Router, ruta `/history`) con:
   - Feed cronológico consolidado (3 colecciones) o por colección (toggle).
   - Filtros: colección, documento (`parent`), rango de fechas, autor (si G-1 resuelto),
     texto libre sobre título/ticketId del documento versionado.
   - Entrada expandida = diff visual (jsondiffpatch HTML) entre `version` actual y
     anterior del mismo `parent`.
   - Acción **Restore** por entrada (confirmación explícita → `POST …/versions/:id`).
   - Paginación (el endpoint es paginado nativamente).
3. Route handler(s) server-side bajo `/api/history` que agregan las 3 colecciones de
   versiones (3 llamadas `findVersions` vía Local API en paralelo, merge + sort por
   fecha, paginación sobre el resultado combinado). El frontend nunca golpea las 3 REST
   de versiones directamente.
4. `readVersions` ACL + tests — **policy de acceso del §6, requisito indispensable**.

### Out of scope
- Drafts, autosave, publishing schedule (no aplican: local-pm no tiene flujo editorial).
- Versionado de globals (no hay globals en el repo).
- Diffs de richText a nivel de bloque Lexical (v1: diff del objeto Lexical serializado;
  refinamiento posterior).
- Retention policies custom (nativo: `maxPerDoc`).
- Sync con el repo upstream (es trabajo del fork).

## 4. Diseño

### 4.1 Cambios en colecciones (mínimo invasivo)

```ts
// src/collections/{Projects,Teams,Tickets}.ts — única línea por archivo
  versions: {
    maxPerDoc: 100,   // §5.2
  },
```

Sin `drafts`. Sin cambios de shape de datos (docs: *"They don't change the shape of
your data at all"*). Las colecciones `_projects_versions`, `_teams_versions`,
`_tickets_versions` aparecen automáticamente en la primera escritura posterior al
deploy. Datos existentes: sin versiones retroactivas — el trail arranca en el deploy
(gap aceptado, G-4).

### 4.2 Estructura nueva (App Router, convención `(frontend)` existente)

```
src/app/(frontend)/history/
  page.tsx                  # server component: metadata + fetch inicial
  HistoryClient.tsx         # client component: filtros, feed, expansión, restore
src/app/api/history/
  route.ts                  # GET: agregado consolidado de las 3 colecciones de versiones
src/components/history/
  VersionDiff.tsx           # wrapper jsondiffpatch (render HTML + estilos del repo)
  VersionRow.tsx            # fila colapsable del feed (meta + acción Restore)
  HistoryFilters.tsx        # barra de filtros
docs/specs/
  2026-09-05_SPC-001_audit-trail-restore.md   # este archivo
```

### 4.3 Endpoint de agregación `GET /api/history`

Query params: `collection=tickets|projects|teams|all` (default `all`),
`parent=<id>`, `from=ISO`, `to=ISO`, `q=<texto>`, `page`, `limit` (default 20, cap 100).

Contrato de respuesta:

```jsonc
{
  "docs": [
    {
      "id": "<version id>",
      "collection": "tickets",
      "parent": "<doc id>",
      "parentLabel": "TICK-0042 · Fix pool PHP-FPM",   // resuelto server-side
      "autosave": false,
      "createdAt": "…",
      "diff": { …jsondiffpatch delta vs versión previa del mismo parent… }  // opcional, ?withDiff=1
    }
  ],
  "page": 1, "limit": 20, "totalDocs": 87
}
```

Restore **no** pasa por este endpoint: el cliente llama el REST nativo
`POST /api/{slug}/versions/:id` (mismo origen, cookies de sesión — no auth extra).

### 4.4 Diff visual

- **Motor:** `jsondiffpatch` (github.com/benjamine/jsondiffpatch). Diff de objetos JS,
  delta serializable, `html()` para render, `unpatch()` para revert programático
  (no requerido en v1 — el restore nativo es por versión completa).
- Comparación: `version[N]` vs `version[N-1]` del mismo `parent`, ordenadas por
  `updatedAt`. Primer registro de un `parent` (creación) → diff contra `{}`.
- Render: formato "changelog" (campo → antes → después), estilos con las convs del
  repo (Tailwind v4 presente; colores semánticos: verde=added, rojo=removed, ámbar=changed).
- Arrays (`labels`, `subtasks`, `blockedBy`): jsondiffpatch con
  `objectHash` (por `name` en labels, por `title` en subtasks) para diffs estables.

### 4.5 UI/UX (v1, mínimo evidente)

```
┌ History ────────────────────────────────────────────────────────┐
│ [collection: all ▾] [doc: — ▾] [date range] [q________] [Filtrar]│
├──────────────────────────────────────────────────────────────────┤
│ ▸ 2026-09-05 14:32 · tickets · TICK-0042 Fix pool · by u1  [⟲]  │
│ ▸ 2026-09-05 13:58 · projects · omega-pcf ·            [⟲]      │
│ ▾ 2026-09-05 13:41 · tickets · TICK-0041 …                       │
│     status:  todo → in-progress                                  │
│     priority: medium (sin cambio)                                │
│     subtasks: + "revisar logs"                                   │
│     [Restore this version]  ← confirm modal                      │
└──────────────────────────────────────────────────────────────────┘
```

- Filas colapsables; expandida muestra el diff (requisito: "más detalle visual de que
  cambios y en donde y un ui donde eso sea evidente").
- Restore con confirmación; post-restore la fila muestra badge "restored" y el feed se
  refresca (el restore crea una nueva versión — feedback inmediato en el propio trail).

## 5. Decisiones y gaps abiertos (se resuelven antes de implementar)

- **D-1 · `maxPerDoc`:** propuesta 100 (default de Payload es 100; se fija explícito).
  Requerimiento de retención productiva pendiente del usuario.
- **G-1 · Autor del cambio:** las versiones documentan `autosave` y fechas; el autor
  queda en `req.user` al momento del update. Verificar en runtime si el snapshot guarda
  un campo de autor; si no, opción mínima: hook `beforeChange` que estampe
  `_lastChangedBy` en el documento (entra al snapshot siguiente). No bloquea v1
  (el trail funciona sin autor; el filtro "por autor" se activa al resolverlo).
- **G-2 · Rendimiento del agregado:** 3 `findVersions` en paralelo + merge en memoria;
  paginación sobre el merge. Suficiente a escala local-pm (v1). Si crece, mover a
  pipeline de Mongo sobre las 3 colecciones `_versions`.
- **G-3 · Exposición:** resuelta por decisión — **ADR-001** (D1/D2): binding
  loopback-only en modo local y provisionamiento de dos identidades (master user +
  master agent user, credenciales distinguidas). El perímetro se cierra en la capa de
  aplicación con esas dos identidades; la policy del §6 restringe el trail por rol.
- **G-4 · Trail retroactivo:** no existe para datos previos al deploy (por diseño de
  Payload). Aceptado en este spec.
- **G-5 · Nombre de la tab:** por definir por el usuario (`History` es working name).

## 6. Access policy (NORMATIVO, requisito indispensable — xref REQ-002)

De conformidad con **REQ-002.4** ([distinguished actor credentials & role policy](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md)) y **ADR-001 (D2)**:

1. El provisionamiento es de **dos identidades**: un single master user (humano) y un single master agent user (automatización), con credenciales distinguidas.
2. **La identidad de agente NO tiene acceso — por policy (rol/ACL), no por convención — a audit trails ni a rollbacks:**
   - Lectura de versiones (`readVersions`, REST `GET …/versions*`, Admin UI de versiones): **denegada al agente**.
   - Restore/rollback (`POST …/versions/:id`): **denegado al agente**.
   - El audit trail y la capacidad de reversión son **exclusivos del master user** ("debe ser inaccesible más que para user").
3. Implementación mínima correspondiente: `readVersions` ACL por identidad; la operación restore queda cubierta por la misma exclusión (`update`/restore solo master user). Un intento del agente debe responder denegado (verificación §7.7).

La exclusión del agente es de **policy**: aun con la credencial válida, las operaciones de trail/restore le están vedadas por rol. Un agente con capacidad de reescribir historia anula el propósito del audit trail (separación de roles = tamper-evidence operativa).

## 7. Verificación (acceptance criteria)

1. `docker compose up -d --build` verde tras los cambios (el PR #1 ya arregla el build base).
2. CRUD desde el Kanban genera entradas en `_tickets_versions` (verificado en Mongo).
3. `/history` lista el feed consolidado; cada filtro produce resultados correctos contra
   el dataset de prueba (`npm run seed`).
4. Expandir una entrada muestra el diff campo por campo (added/removed/changed).
5. Restore desde la tab deja el documento en el estado de la versión elegida y crea
   nueva versión (visible en el propio feed).
6. Sin regresión: board/projects/teams operan idénticos.
7. **Policy:** la identidad de agente recibe DENIED en `GET …/versions` y `POST …/versions/:id`; el master user recibe 200/éxito en ambas. Atribución: toda versión registra la identidad (agente vs user) del cambio que la originó (xref REQ-002.2).

## 8. Referencias

- Payload Versions (config, `_slug_versions`, REST/GraphQL/Local ops, ACL `readVersions`):
  payloadcms.com/docs/versions/overview
- [REQ-002 — distinguished actor credentials & role policy](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) (base normativa del §6)
- [REQ-001 — loopback-only binding](../requirements/2026-09-05_REQ-001_loopback-only-binding.md) · [ADR-001 — local-first, loopback-only, two-identity provisioning](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md)
- Payload Drafts (por qué NO aplica): payloadcms.com/docs/versions/drafts
- jsondiffpatch: github.com/benjamine/jsondiffpatch
- Base de build: anaskasmi/local-pm@9848720 (+ PR #1 tsconfig fix)
