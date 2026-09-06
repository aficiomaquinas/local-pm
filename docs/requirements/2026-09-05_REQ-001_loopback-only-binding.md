# REQ-001 — Loopback-only binding (no non-loopback exposure)

| | |
|---|---|
| **ID** | REQ-001 |
| **Date** | 2026-09-05 |
| **Status** | DRAFT — pending review. |
| **Type** | Requirement (what must be fulfilled, not how) |
| **Related** | [ADR-001 — Local-first loopback binding](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md) · `docker-compose.yml` |

---

## Current state (evidence, 2026-09-05)

- `docker-compose.yml` published `app: "3010:3010"` and `mongodb: "27018:27017"` → effective bind `0.0.0.0`.
- Verified at runtime: `ss -tlnp` showed `0.0.0.0:27018` and `0.0.0.0:3010`; MongoDB **without authentication**, reachable from the whole LAN (192.168.15.0/24).

## Requirement

- **REQ-001.1:** The stack must NOT expose any port on non-loopback interfaces in local mode. App and Mongo bound to `127.0.0.1` (compose: `127.0.0.1:3010:3010`; for Mongo, `127.0.0.1:27018:27017` or removal of the publish — the app talks over the compose internal network).
- **REQ-001.2:** MongoDB must require authentication, or remain with no published ports (access exclusively via the compose internal network). Valid combinations:
  - no auth + no publish → **acceptable**
  - auth + loopback publish → **acceptable**
  - no auth + publish (loopback or not) → **NOT acceptable**

## Direction note (reference)

The pattern required here — services bound to loopback, the only public surface delegated to a TLS reverse proxy — is the desired behavior for a future public-hosting scenario: public exposure is added EXCLUSIVELY as a reverse-proxy layer, with the internal service identical to local mode, and proxy access properly restricted/authenticated. Full rationale and decision scope: **ADR-001** (normative reference).

## Verification

- `ss -tlnp | grep -E '3010|27018'` shows `127.0.0.1:…` exclusively.
- From another LAN host: `curl http://<ip>:3010` and `nc <ip> 27018` fail.

## Pending user decision

| ID | Decision |
|---|---|
| D-R1 | Publish Mongo on loopback with auth, or no publish (internal network only) |
