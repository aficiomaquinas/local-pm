# REQ-001 — Loopback-only binding (no non-loopback exposure)

| | |
|---|---|
| **ID** | REQ-001 |
| **Date** | 2026-09-05 |
| **Status** | DRAFT — pending review. Sin commit. |
| **Type** | Requirement (qué debe cumplirse, no cómo) |
| **Related** | [ADR-001 — Local-first loopback binding](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md) · `docker-compose.yml` |

---

## Estado actual (evidencia, 2026-09-05)

- `docker-compose.yml` publica `app: "3010:3010"` y `mongodb: "27018:27017"` → bind efectivo `0.0.0.0`.
- Verificado en runtime: `ss -tlnp` mostró `0.0.0.0:27018` y `0.0.0.0:3010`; MongoDB **sin autenticación** accesible desde la LAN completa (192.168.15.0/24).

## Requerimiento

- **REQ-001.1:** El stack NO debe exponer ningún puerto en interfaces no-loopback en modo local. App y Mongo bound a `127.0.0.1` (compose: `127.0.0.1:3010:3010`; para Mongo, `127.0.0.1:27018:27017` o eliminación del publish — la app habla por la red interna de compose).
- **REQ-001.2:** MongoDB debe requerir autenticación, o permanecer sin publish de puertos (acceso exclusivo vía red interna de compose). Combinaciones válidas:
  - sin auth + sin publish → **aceptable**
  - auth + publish loopback → **aceptable**
  - sin auth + publish (loopback o no) → **NO aceptable**

## Nota de dirección (referencia)

El patrón aquí requerido — servicios bound a loopback, única superficie pública delegada a un reverse proxy con TLS — es el comportamiento deseado para un futuro escenario de hosting público: la exposición pública se agrega EXCLUSIVAMENTE como capa rev proxy, con el servicio interno idéntico al modo local, y el acceso al proxy debidamente restringido/autenticado. Racional completo y alcance de la decisión: **ADR-001** (referencia normativa).

## Verificación

- `ss -tlnp | grep -E '3010|27018'` muestra `127.0.0.1:…` exclusivamente.
- Desde otro host de la LAN: `curl http://<ip>:3010` y `nc <ip> 27018` fallan.

## Decisión pendiente del usuario

| ID | Decisión |
|---|---|
| D-R1 | Publicar Mongo en loopback con auth, o sin publish (red interna únicamente) |
