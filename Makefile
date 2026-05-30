# Society Events — Developer Makefile
# Usage: make <target>

.PHONY: help up down restart logs ps reset seed shell-db shell-redis sync-users setup-google-idp \
        frontend frontend-install frontend-docker \
        restart-nginx restart-keycloak restart-postgres restart-redis \
        restart-pgadmin restart-user-service restart-event-service restart-cloudflared \
        restart-mfe-admin restart-mfe-events restart-mfe-booking restart-mfe-payment \
        restart-splunk restart-fluent-bit \
        logs-nginx logs-kc logs-db logs-user logs-events \
        logs-cloudflared logs-mfe-admin logs-mfe-events logs-mfe-booking logs-mfe-payment \
        logs-splunk logs-fluent-bit \
        monitoring-up monitoring-down \
        splunk-up splunk-down fluent-bit-up fluent-bit-down

## ── Colours ────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
RESET := \033[0m

help: ## Show this help
	@echo ""
	@echo "  Society Events — Local Dev Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-26s$(RESET) %s\n", $$1, $$2}'
	@echo ""

## ── Core lifecycle ──────────────────────────────────────────────────────────
up: .env ## Start all core services (detached)
	docker compose up -d --build
	@echo ""
	@echo "  $(CYAN)Services starting… (all routed through nginx on port $${NGINX_PORT:-8080})$(RESET)"
	@echo "  Frontend  → http://localhost:$${NGINX_PORT:-8080}/          (requires --profile frontend)"
	@echo "  Keycloak  → http://localhost:8081/admin/                    (direct — bypasses nginx)"
	@echo "  pgAdmin   → http://localhost:$${NGINX_PORT:-8080}/pgadmin/  (nginx basic auth)"
	@echo "  Cloudflared tunnel starts automatically with core services."
	@echo ""
	@echo "  Postgres and Redis are internal only (no host port)."
	@echo "  Monitoring (Splunk + Fluent Bit) — run: make monitoring-up"
	@echo "  Run 'make logs' to follow logs or 'make ps' to check health."
	@echo ""
	@echo "  For LAN access run scripts/wsl2_port_forward.ps1 as Administrator."

down: ## Stop and remove containers (data volumes preserved)
	docker compose down

restart: ## Restart all core services (rebuilds frontend to pick up code changes)
	docker compose --profile frontend up -d --build frontend mfe-admin mfe-events mfe-booking mfe-payment
	docker compose restart nginx keycloak postgres redis pgadmin user-service event-service cloudflared

## ── Individual service restarts ─────────────────────────────────────────────
restart-nginx: ## Rebuild & restart nginx (nginx.conf is baked into the image)
	docker compose up -d --build nginx

restart-keycloak: ## Restart Keycloak only (picks up theme/realm changes)
	docker compose restart keycloak

restart-postgres: ## Restart Postgres only
	docker compose restart postgres

restart-redis: ## Restart Redis only
	docker compose restart redis

restart-pgadmin: ## Restart pgAdmin only
	docker compose restart pgadmin

restart-user-service: ## Rebuild & restart user service (picks up code changes)
	docker compose up -d --build user-service

restart-event-service: ## Rebuild & restart event service (picks up code changes)
	docker compose up -d --build event-service

restart-cloudflared: ## Restart Cloudflare tunnel
	docker compose restart cloudflared

restart-mfe-admin: ## Rebuild & restart mfe-admin container
	docker compose --profile frontend up -d --build mfe-admin

restart-mfe-events: ## Rebuild & restart mfe-events container
	docker compose --profile frontend up -d --build mfe-events

restart-mfe-booking: ## Rebuild & restart mfe-booking container
	docker compose --profile frontend up -d --build mfe-booking

restart-mfe-payment: ## Rebuild & restart mfe-payment container
	docker compose --profile frontend up -d --build mfe-payment

restart-splunk: ## Restart Splunk only (monitoring profile)
	docker compose --profile monitoring restart splunk

restart-fluent-bit: ## Restart Fluent Bit only (monitoring profile)
	docker compose --profile monitoring restart fluent-bit

## ── Monitoring stack ────────────────────────────────────────────────────────
monitoring-up: ## Start Splunk + Fluent Bit monitoring stack
	docker compose --profile monitoring up -d splunk fluent-bit
	@echo ""
	@echo "  $(CYAN)Monitoring stack starting…$(RESET)"
	@echo "  Splunk UI → http://localhost:$${NGINX_PORT:-8080}/splunk/  (nginx proxy)"
	@echo "  Splunk direct → http://localhost:8000  (dev only)"
	@echo "  Run 'make logs-splunk' to follow Splunk startup logs."
	@echo ""

monitoring-down: ## Stop Splunk + Fluent Bit monitoring stack
	docker compose --profile monitoring stop splunk fluent-bit

splunk-up: ## Start Splunk only (without Fluent Bit)
	docker compose --profile monitoring up -d splunk
	@echo "  $(CYAN)Splunk starting — UI at http://localhost:8000$(RESET)"

splunk-down: ## Stop Splunk only
	docker compose --profile monitoring stop splunk

fluent-bit-up: ## Start Fluent Bit only (Splunk must already be running)
	docker compose --profile monitoring up -d fluent-bit

fluent-bit-down: ## Stop Fluent Bit only
	docker compose --profile monitoring stop fluent-bit

## ── Status ──────────────────────────────────────────────────────────────────
ps: ## Show service status and health
	docker compose ps

## ── Logs ────────────────────────────────────────────────────────────────────
logs: ## Follow logs for all running services
	docker compose logs -f

logs-nginx: ## Follow nginx logs only
	docker compose logs -f nginx

logs-kc: ## Follow Keycloak logs only
	docker compose logs -f keycloak

logs-db: ## Follow Postgres logs only
	docker compose logs -f postgres

logs-user: ## Follow user service logs only
	docker compose logs -f user-service

logs-events: ## Follow event service logs only
	docker compose logs -f event-service

logs-cloudflared: ## Follow Cloudflare tunnel logs
	docker compose logs -f cloudflared

logs-mfe-admin: ## Follow mfe-admin logs
	docker compose --profile frontend logs -f mfe-admin

logs-mfe-events: ## Follow mfe-events logs
	docker compose --profile frontend logs -f mfe-events

logs-mfe-booking: ## Follow mfe-booking logs
	docker compose --profile frontend logs -f mfe-booking

logs-mfe-payment: ## Follow mfe-payment logs
	docker compose --profile frontend logs -f mfe-payment

logs-splunk: ## Follow Splunk logs (monitoring profile)
	docker compose --profile monitoring logs -f splunk

logs-fluent-bit: ## Follow Fluent Bit logs (monitoring profile)
	docker compose --profile monitoring logs -f fluent-bit

## ── Database ────────────────────────────────────────────────────────────────
shell-db: ## Open psql in the society_events database
	docker compose exec postgres psql -U $${POSTGRES_USER:-society_user} -d society_events

shell-redis: ## Open redis-cli
	docker compose exec redis redis-cli -a $${REDIS_PASSWORD:-R3d!sP@ss2025}

seed: ## Re-run only the seed script (idempotent — uses ON CONFLICT DO NOTHING)
	docker compose exec -T postgres \
	  psql -U $${POSTGRES_USER:-society_user} -d society_events \
	  -f /docker-entrypoint-initdb.d/02_seed.sql
	@echo "Seed complete."

migrate: ## Run pending SQL migrations in db/migrations/ (idempotent)
	@for f in db/migrations/*.sql; do \
	  echo "Running $$f…"; \
	  docker compose exec -T postgres psql -U $${POSTGRES_USER:-society_user} -d society_events -f /dev/stdin < $$f; \
	done
	@echo "Migrations complete."

setup-google-idp: ## Apply Google IDP + first-broker-login flow to the RUNNING Keycloak (idempotent)
	python3 scripts/setup_google_idp.py

sync-users: ## Sync users from keycloak/realm.json → postgres (inserts only, never overwrites)
	docker run --rm \
	  --network society_network \
	  -v $(PWD)/keycloak/realm.json:/realm.json:ro \
	  -v $(PWD)/scripts/sync_keycloak_users.py:/sync.py:ro \
	  -e POSTGRES_HOST=society_postgres \
	  -e POSTGRES_DB=society_events \
	  -e POSTGRES_USER=$${POSTGRES_USER:-society_user} \
	  -e POSTGRES_PASSWORD=$${POSTGRES_PASSWORD:-S0c!etyP@ss2025} \
	  -e REALM_JSON_PATH=/realm.json \
	  python:3.12-alpine \
	  sh -c "pip install psycopg2-binary -q && python /sync.py"

## ── Reset ───────────────────────────────────────────────────────────────────
reset: ## ⚠ Destroy ALL volumes, restart from scratch, then sync users from realm.json
	@echo "$(CYAN)Stopping containers and removing volumes…$(RESET)"
	docker compose down -v --remove-orphans
	docker compose up -d --build
	@echo "$(CYAN)Waiting for postgres to be healthy…$(RESET)"
	@until docker compose exec -T postgres pg_isready -U $${POSTGRES_USER:-society_user} -d society_events -q; do sleep 2; done
	@$(MAKE) sync-users
	@echo "$(CYAN)Fresh environment ready.$(RESET)"

## ── Frontend ────────────────────────────────────────────────────────────────
frontend: ## Start the Shell App dev server on http://localhost:3000 (hot-reload)
	cd frontend/shell && npm install && npm run dev

frontend-install: ## Install frontend dependencies only
	cd frontend/shell && npm install

frontend-docker: ## Build and run all production frontend containers (served by nginx at /)
	docker compose --profile frontend build --no-cache frontend mfe-admin mfe-events mfe-booking mfe-payment
	docker compose --profile frontend up -d frontend mfe-admin mfe-events mfe-booking mfe-payment
	@echo "  Shell App → http://localhost:$${NGINX_PORT:-8080}/"

## ── Helpers ─────────────────────────────────────────────────────────────────
.env:   ## Auto-create .env from .env.example if missing
	@if [ ! -f .env ]; then \
	  cp .env.example .env; \
	  echo "$(CYAN).env created from .env.example — review values before starting.$(RESET)"; \
	fi
