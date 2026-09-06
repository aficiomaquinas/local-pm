# ADR-001 — Local-first, loopback-only binding, two-identity provisioning

| | |
|---|---|
| **ID** | ADR-001 |
| **Date** | 2026-09-05 |
| **Status** | ACCEPTED |
| **Context docs** | [REQ-001](../requirements/2026-09-05_REQ-001_loopback-only-binding.md) · [REQ-002](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · [SPC-001 — Audit trail & restore](../specs/2026-09-05_SPC-001_audit-trail-restore.md) |

---

## Context

1. **Intent original del proyecto:** self-hosted, uso local, operador único — igual que el creador original del upstream (`anaskasmi/local-pm`). El fork (`aficiomaquinas/local-pm`) hereda ese objetivo; no hay pivot a hosting público.
2. **Hallazgo de seguridad (2026-09-05):** `docker-compose.yml` publica la app (3010) y MongoDB (27018) sobre `0.0.0.0`; MongoDB además corre **sin autenticación**. Verificado en runtime: ambos puertos alcanzables desde la LAN completa. Con datos productivos, cualquier equipo de la red puede leer, escribir o extraer la base completa.
3. **Fase entrante:** módulo de audit trail/rollback (spec adjunto) y datos productivos en el volumen — el costo de exposición sube.
4. **Vector git:** ambos remotes del repo son públicos; el aislamiento de datos se resuelve fuera del árbol (backups fuera del working tree), pero la superficie de red es la exposición primaria en modo local.

## Decision

- **D1 — Loopback-only binding (local mode):** todo puerto publicado se bind a `127.0.0.1`. MongoDB sin publish de host (red interna de compose únicamente). Detalle normativo: REQ-001.
- **D2 — Two-identity provisioning:** el producto se provisiona con un **single master user** (humano) y un **single master agent user** (automatización), con credenciales distinguidas. El agente queda excluido por policy de audit trails y rollbacks. Detalle normativo: REQ-002 y spec §5.
- **D3 — Public hosting, si algún día aplica, exclusivamente como capa de reverse proxy** (TLS, acceso restringido/autenticado) frente a servicios internos idénticos al modo local. La topología interna no cambia para exponer al público.
- **D4 — Fortalecimiento prospectivo:** la dirección general es endurecer backups/restore y credenciales mirando hacia adelante — no cambiar el objetivo primario, que sigue siendo uso local.

## Explicit non-goals

- No se pivota a multi-tenant ni a hosting público en esta fase.
- No se introduce auth stack completo "por si acaso": el mínimo viable aceptado es binding loopback (D1) + el modelo de dos identidades (D2) cuando entre la fase productiva.

## Consequences

- La LAN deja de alcanzar app y Mongo; el acceso local continúa vía loopback sin fricción.
- Exponer públicamente exige un paso explícito adicional (rev proxy), lo que hace imposible la exposición accidental.
- El audit trail gana valor como evidencia: con D2, cada entrada tiene actor inequívoco y solo el humano puede reescribir historia.

## Alternatives considered

| Alternativa | Veredicto |
|---|---|
| Status quo (0.0.0.0 + Mongo sin auth) | Rechazada: exposición LAN sin autenticación con datos productivos |
| Auth stack completo en todos los servicios desde ya | Diferida: excede el mínimo para uso local; D2 la cubre en la capa de aplicación al entrar a productivo |
| Overlay/VPN (tailscale/wireguard) para acceso remoto | Viable como futuro medio de acceso remoto; no requerido para el objetivo local; no excluido por esta decisión |
