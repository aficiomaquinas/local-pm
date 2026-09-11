# Minimal Makefile — one-command E2E harness (INV-E2E-STACK R4).
# The unit gate stays `pnpm verify`; these targets orchestrate the E2E stack
# (base + test + e2e overlay chain, project local-pm-e2e).

COMPOSE_E2E := docker compose -p local-pm-e2e \
  -f docker-compose.yml -f docker-compose.test.yml -f docker-compose.e2e.yml

E2E_URL := http://127.0.0.1:3012

.PHONY: e2e-up e2e-test e2e-down e2e-logs

# Start the disposable E2E stack and wait for health.
e2e-up:
	$(COMPOSE_E2E) up -d --build
	@echo "Waiting for app-e2e ($(E2E_URL))..."
	@for i in $$(seq 1 60); do \
		code=$$(curl -s -o /dev/null -w '%{http_code}' $(E2E_URL)/board 2>/dev/null || true); \
		[ "$$code" = "200" ] && break; \
		sleep 3; \
	done; \
	code=$$(curl -s -o /dev/null -w '%{http_code}' $(E2E_URL)/board 2>/dev/null || true); \
	[ "$$code" = "200" ] || (echo "app-e2e did not come up; logs:"; $(COMPOSE_E2E) logs --tail 50 app; exit 1)
	@echo "E2E stack is up."

# Run both smoke suites against the running stack (exit = first failure).
# Order + emails matter (verified live 2026-09-11):
#   - T2 runs FIRST: first-register (E-7) is one-shot — it needs an EMPTY
#     users collection, so it must seed the DB before T3's OIDC logins.
#   - ADMIN_EMAIL must DIFFER from the dex static user (ops@local.test):
#     Payload 3.88 hardcodes email unique on auth collections, so the local
#     master and the OIDC human mirror cannot share an address (open design
#     question for account-linking; see docs/investigations/ 2026-09-10*).
e2e-test: e2e-up
	BASE_URL=$(E2E_URL) ADMIN_EMAIL=master@local.test scripts/e2e-smoke.sh
	scripts/e2e-oidc.sh

# Tear the E2E stack down and drop its volumes (disposable by design).
e2e-down:
	$(COMPOSE_E2E) down --volumes --remove-orphans

e2e-logs:
	$(COMPOSE_E2E) logs --tail 100
