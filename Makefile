# Society Events — Developer Makefile
# Usage: make <target>

.PHONY: help up down restart logs ps reset seed shell-db shell-redis sync-users frontend frontend-install

## ── Colours ────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
RESET := \033[0m

help: ## Show this help
	@echo ""
	@echo "  Society Events — Local Dev Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-18s$(RESET) %s\n", $$1, $$2}'
	@echo ""

## ── Core lifecycle ─────────────────────────────────────────────────────────
up: .env ## Start all services (detached)
	docker compose up -d --build
	@echo ""
	@echo "  $(CYAN)Services starting… (all routed through nginx on port $${NGINX_PORT:-8080})$(RESET)"
	@echo "  Frontend  → http://localhost:$${NGINX_PORT:-8080}/          (requires --profile frontend)"
	@echo "  Keycloak  → http://localhost:$${NGINX_PORT:-8080}/admin/"
	@echo "  pgAdmin   → http://localhost:$${NGINX_PORT:-8080}/pgadmin/  (nginx basic auth)"
	@echo "  Mailpit   → http://localhost:$${NGINX_PORT:-8080}/mail/     (nginx basic auth)"
	@echo ""
	@echo "  Postgres and Redis are internal only (no host port)."
	@echo "  Run 'make logs' to follow logs or 'make ps' to check health."
	@echo ""
	@echo "  For LAN access run scripts/wsl2_port_forward.ps1 as Administrator."

down: ## Stop and remove containers (data volumes preserved)
	docker compose down

restart: ## Restart all services (rebuilds frontend to pick up code changes)
	docker compose --profile frontend up -d --build frontend
	docker compose restart nginx keycloak postgres redis mailpit pgadmin

ps: ## Show service status and health
	docker compose ps

logs: ## Follow logs for all services
	docker compose logs -f

logs-db: ## Follow postgres logs only
	docker compose logs -f postgres

logs-kc: ## Follow Keycloak logs only
	docker compose logs -f keycloak

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

frontend-docker: ## Build and run the production frontend container (served by nginx at /)
	docker compose --profile frontend up -d --build frontend
	@echo "  Shell App → http://localhost:$${NGINX_PORT:-8080}/"

## ── Helpers ─────────────────────────────────────────────────────────────────
.env:   ## Auto-create .env from .env.example if missing
	@if [ ! -f .env ]; then \
	  cp .env.example .env; \
	  echo "$(CYAN).env created from .env.example — review values before starting.$(RESET)"; \
	fi
