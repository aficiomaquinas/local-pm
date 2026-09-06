# Documentación del repositorio — convención

Este directorio centraliza la documentación normativa y de diseño de `local-pm`.
Toda decisión, requerimiento y especificación vive aquí, versionada en git junto
al código al que aplica. Esta página documenta la convención vigente; los
documentos existentes son la referencia de estilo.

## Estructura

| Folder | Contenido | Pregunta que responde |
|---|---|---|
| `docs/adr/` | Architecture Decision Records — decisiones tomadas, con contexto y consecuencias | ¿Qué se decidió y por qué? |
| `docs/requirements/` | Requerimientos — qué debe cumplirse, sin especificar cómo | ¿Qué se requiere? |
| `docs/specs/` | Especificaciones de diseño — cómo se implementa un requerimiento | ¿Cómo se implementa? |

## Nomenclatura de archivos

```
YYYY-MM-DD_<TYPE>-<NNN>_<slug>.md
```

- `YYYY-MM-DD`: fecha de creación del documento (no de última edición).
- `<TYPE>`: `REQ` (requirement) · `ADR` (decision record) · `SPC` (spec).
- `<NNN>`: número consecutivo por tipo, sin ceros a la izquierda del milestone
  de tres dígitos (`REQ-001`, `ADR-002`, `SPC-003`, …).
- `<slug>`: kebab-case, descriptivo y estable. El slug NO se reescribe en
  renombrados posteriores salvo que el ID sea el que faltaba.

Ejemplos reales: `2026-09-05_REQ-003_workspace-restructure.md`,
`2026-09-05_ADR-001_local-first-loopback-binding.md`,
`2026-09-05_SPC-001_audit-trail-restore.md`.

## Esquema de IDs

| Tipo | Formato | Numeración |
|---|---|---|
| Requerimiento | `REQ-NNN` | Consecutiva por tipo: REQ-001, REQ-002, … |
| Decisión | `ADR-NNN` | Consecutiva por tipo: ADR-001, ADR-002, … |
| Especificación | `SPC-NNN` | Consecutiva por tipo: SPC-001, SPC-002, … |

Los IDs son permanentes: un documento retirado conserva su número y no se
recicla. El siguiente documento de cada tipo toma el número inmediatamente
posterior al mayor existente.

## Ciclo de status

El status vive en la tabla del header de cada documento.

| Tipo | Valores |
|---|---|
| ADR | `PROPOSED` (pendiente de revisión del usuario) → `ACCEPTED` · `REJECTED` · `SUPERSEDED` (reemplazado por otro ADR, que debe citarlo) |
| REQ | `DRAFT` (pendiente de revisión del usuario) → `APPROVED` → `IMPLEMENTED` · `REJECTED` |
| SPC | `DRAFT` (pendiente de revisión del usuario) → `APPROVED` → `IMPLEMENTED` |

- `DRAFT`/`PROPOSED`: el documento no compromete al operador; puede corregirse
  libremente hasta su aprobación.
- `APPROVED`/`ACCEPTED`: materialmente vinculante; los cambios posteriores se
  registrado en el propio documento (o mediante un documento que lo supersede).
- `IMPLEMENTED`: la implementación verificó los criterios de aceptación del
  documento; el documento no se borra — es el registro histórico.
- Los documentos rechazados se conservan (nunca se eliminan): la decisión de no
  hacer algo también es conocimiento del repo.

## Xrefs (referencias cruzadas)

- Siempre **relativas** al archivo que referencia (`../specs/…`, `../adr/…`,
  `../requirements/…`) — nunca absolutas ni URLs al remote.
- El texto del enlace cita el ID (`[REQ-003 — …](…)`), de modo que el xref
  sigue legible aunque el archivo renombre.
- Los anchors internos de sección (`§5`, `§6`) se citan en el texto del enlace,
  no en la ruta; un renombrado de archivo no los altera.
- Al renombrar un documento, se actualizan todos los xrefs entrantes en el
  mismo commit (`git grep <nombre-viejo>` para localizarlos).

## Origen

Cada documento deriva de instrucciones verbatim del usuario, registradas en el
TODO track (`~/.hermes/profiles/ttamayo/todo/TODO.md`). El spec/ADR cita el
item de origen cuando aplica (campo `Scope driver` en specs). El contenido
normativo es el del documento; el TODO track es el registro de la instrucción,
no la especificación.

## Índice vigente

| ID | Documento | Status |
|---|---|---|
| REQ-001 | [Loopback-only binding](requirements/2026-09-05_REQ-001_loopback-only-binding.md) | DRAFT |
| REQ-002 | [Distinguished actor credentials & role policy](requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) | DRAFT |
| REQ-003 | [Repository restructure per best practices](requirements/2026-09-05_REQ-003_workspace-restructure.md) | DRAFT |
| ADR-001 | [Local-first, loopback-only binding, two-identity provisioning](adr/2026-09-05_ADR-001_local-first-loopback-binding.md) | ACCEPTED |
| ADR-002 | [OIDC-compliant authentication](adr/2026-09-05_ADR-002_oidc-authentication.md) | PROPOSED |
| SPC-001 | [Audit trail & restore (Payload native versions)](specs/2026-09-05_SPC-001_audit-trail-restore.md) | DRAFT |
| SPC-002 | [Workspace restructure (resuelve REQ-003)](specs/2026-09-05_SPC-002_workspace-restructure.md) | DRAFT |

Al crear un documento, agregarlo a este índice en el mismo commit.
