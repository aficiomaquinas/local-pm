# REQ-002 — Distinguished actor credentials (human vs agent) & role policy

| | |
|---|---|
| **ID** | REQ-002 |
| **Date** | 2026-09-05 |
| **Status** | DRAFT — pending review. Sin commit. |
| **Type** | Requirement (qué debe cumplirse, no cómo) |
| **Related** | [Spec audit trail & restore — §5 Access policy](../specs/2026-09-05_audit-trail-restore-spec.md) · [ADR-001](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md) |

---

## Modelo de provisionamiento (normativo, fase actual)

El producto se provisiona con exactamente dos identidades operativas:

| Identidad | Naturaleza | Uso |
|---|---|---|
| **Master user** | Humano (operador) | webUI, administración, audit trail, rollbacks |
| **Master agent user** | Automatización (MCP/REST tooling) | mutaciones de tickets/projects/teams por agentes |

Las dos identidades llevan **credenciales distinguidas**. Un agente NUNCA opera bajo la identidad del humano ni reutiliza sus credenciales. (Fortalecimiento prospectivo — ver ADR-001: el objetivo primario sigue siendo uso local, igual que el creador original.)

## Estado actual (evidencia, 2026-09-05 — inspección de código; confirmación runtime pendiente)

- Las tres colecciones declaran `access: { read/create/update/delete: () => true }` → **no hay autenticación exigida**; `req.user` es indefinido en operaciones por API/REST/MCP.
- El MCP server (README) se conecta con `LOCAL_PM_URL` únicamente, sin credenciales.
- Payload registra el autor de un cambio a partir del usuario autenticado de la request; sin auth, la atribución es nula/anónima.
- Consecuencia actual: un cambio hecho vía webUI y uno hecho por un agente vía MCP/REST son indistinguibles en cualquier audit trail (y lo serán en el módulo de versiones del spec adjunto).

## Requerimiento

- **REQ-002.1:** Todo actor que mute documentos (create/update/delete/restore) opera con credenciales DISTINGUIDAS e inequívocas según el modelo de provisionamiento de arriba. Los agentes NUNCA reutilizan credenciales humanas.
- **REQ-002.2:** Toda entrada de audit trail / version history resuelve a un actor identificado sin ambigüedad: quién (identidad), mediante qué canal (webUI / MCP / REST), cuándo.
- **REQ-002.3:** La confusión de identidad entre actores en tickets/audit log se considera defecto de bloqueo para datos productivos.
- **REQ-002.4 (role policy — indispensable):** La identidad de agente NO tiene acceso, por policy (rol/ACL), a audit trails (lectura de version history) NI a operaciones de rollback/restore. Esas capacidades son exclusivas del master user. Detalle normativo: [Spec audit trail & restore, §5 Access policy](../specs/2026-09-05_audit-trail-restore-spec.md). Racional: un agente con capacidad de reescribir historia anula el propósito del audit trail (separación de roles = tamper-evidence operativa).

**Pregunta abierta registrada (requiere investigación en la implementación):** la atribución es función de la autenticación de Payload (usuarios del sistema). Vía a definir — no es parte de este documento decidirla: usuario bot dedicado para el agente (ajuste natural al modelo de provisionamiento), API keys por actor, o ambos. El requerimiento es el resultado (atribución inequívoca + exclusión de agente del trail/rollback), no el mecanismo.

## Verificación

- Cambio vía webUI por el master user → audit/versión atribuida a esa identidad.
- Cambio vía MCP con la credencial del master agent user → atribuido a la identidad del agente, distinta de la humana.
- La identidad de agente intenta leer `/api/{slug}/versions` o ejecutar `POST …/versions/:id` → **denegado por ACL**; el master user → permitido.
- Intento de mutación sin credenciales → rechazado.

## Decisión pendiente del usuario

| ID | Decisión |
|---|---|
| D-R2 | Mecanismo de credenciales del master agent user (usuario bot dedicado vs API keys), dentro del modelo de provisionamiento de dos identidades |
