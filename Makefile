# Society Events — Developer Makefile
# Usage: make <target> [ENV=dev|test|stage|prod]
#
#   ENV=prod  (default) reads .env
#   ENV=dev            reads .env.dev
#   ENV=test           reads .env.test
#   ENV=stage          reads .env.stage
#
# Examples:
#   make up                  # start production stack
#   make up ENV=dev          # start dev stack
#   make down ENV=test       # stop test stack
#   make logs ENV=stage      # follow stage logs

.PHONY: help up down restart free-ports validate-ports check-env logs ps reset seed \
        shell-db shell-redis sync-users setup-google-idp \
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

## ── Environment ─────────────────────────────────────────────────────────────
ENV      ?= prod
ENV_FILE := $(if $(filter prod,$(ENV)),.env,.env.$(ENV))
COMPOSE  := docker compose --env-file $(ENV_FILE)

## ── Colours ─────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
RESET := \033[0m

help: ## Show this help
	@echo ""
	@echo "  Society Events — Local Dev Commands"
	@echo "  Usage: make <target> [ENV=dev|test|stage|prod]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-26s$(RESET) %s\n", $$1, $$2}'
	@echo ""

## ── Core lifecycle ──────────────────────────────────────────────────────────
check-env: ## Ensure the active env file exists (auto-creates from example if available)
	@if [ ! -f $(ENV_FILE) ]; then \
	  example="$(ENV_FILE).example"; \
	  if [ -f "$$example" ]; then \
	    cp "$$example" $(ENV_FILE); \
	    echo "$(CYAN)$(ENV_FILE) created from $$example — review values before starting.$(RESET)"; \
	  else \
	    echo "$(CYAN)ERROR: $(ENV_FILE) not found. Create it or run: cp .env.example $(ENV_FILE)$(RESET)"; \
	    exit 1; \
	  fi; \
	fi

free-ports: ## Kill stale rootlessport processes that hold project ports (Podman rootless workaround)
	@_released=0; \
	for port in \
	    $$(grep -m1 '^NGINX_PORT='    $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d '"[:space:]' || echo 8080) \
	    $$(grep -m1 '^KEYCLOAK_PORT=' $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d '"[:space:]' || echo 8081) \
	    $$(grep -m1 '^POSTGRES_PORT=' $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d '"[:space:]' || echo 5432) \
	    $$(grep -m1 '^REDIS_PORT='    $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d '"[:space:]' || echo 6379) \
	    $$(grep -m1 '^SPLUNK_PORT='   $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d '"[:space:]' || echo 8000); do \
	  pid=$$(ss -Htlnp | grep ":$$port[[:space:]]" | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1); \
	  if [ -n "$$pid" ]; then \
	    echo "  [free-ports] releasing port $$port (pid $$pid)"; \
	    kill "$$pid" 2>/dev/null || true; \
	    _released=1; \
	  fi; \
	done; \
	[ "$$_released" = "1" ] && sleep 1 || true

validate-ports: check-env ## Validate that host ports in the active env file do not conflict
	@_f=$(ENV_FILE); \
	_get() { grep -m1 "^$$1=" "$$_f" 2>/dev/null | cut -d= -f2- | tr -d '"[:space:]' || echo "$$2"; }; \
	ports="NGINX_PORT:$$(_get NGINX_PORT 8080) KEYCLOAK_PORT:$$(_get KEYCLOAK_PORT 8081) POSTGRES_PORT:$$(_get POSTGRES_PORT 5432) REDIS_PORT:$$(_get REDIS_PORT 6379) SPLUNK_PORT:$$(_get SPLUNK_PORT 8000)"; \
	seen=""; has_conflict=0; \
	for item in $$ports; do \
	  name=$${item%%:*}; port=$${item#*:}; \
	  for prev in $$seen; do \
	    if [ "$${prev#*:}" = "$$port" ]; then \
	      echo "  [validate-ports] $$name and $${prev%%:*} both use port $$port in $(ENV_FILE)"; \
	      has_conflict=1; \
	    fi; \
	  done; \
	  seen="$$seen $$item"; \
	done; \
	if [ "$$has_conflict" = "1" ]; then \
	  echo "  Update $(ENV_FILE) so each exposed service has a unique host port."; \
	  exit 1; \
	fi

up: validate-ports ## Start all services (detached). ENV=dev|test|stage|prod
	@$(MAKE) -s free-ports ENV=$(ENV)
	$(COMPOSE) --profile frontend up -d --build
	@echo ""
	@echo "  $(CYAN)[$(ENV)] Services starting…$(RESET)"
	@echo "  Env file  → $(ENV_FILE)"
	@echo "  Frontend  → http://localhost:$$(grep -m1 '^NGINX_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]')/"
	@echo "  Keycloak  → http://localhost:$$(grep -m1 '^KEYCLOAK_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]')/admin/"
	@echo "  Run 'make logs ENV=$(ENV)' to follow logs."
	@echo ""

down: ## Stop and remove all containers for the active environment
	$(COMPOSE) --profile frontend --profile monitoring down
	@$(MAKE) -s free-ports ENV=$(ENV)

restart: ## Restart all core services (rebuilds changed images)
	$(COMPOSE) --profile frontend up -d --build frontend mfe-admin mfe-events mfe-booking mfe-payment
	$(COMPOSE) restart nginx keycloak postgres redis pgadmin user-service event-service cloudflared

## ── Individual service restarts ─────────────────────────────────────────────
restart-nginx: ## Rebuild & restart nginx (nginx.conf is baked into the image)
	$(COMPOSE) up -d --build nginx

restart-keycloak: ## Restart Keycloak only (picks up theme/realm changes)
	$(COMPOSE) restart keycloak

restart-postgres: ## Restart Postgres only
	$(COMPOSE) restart postgres

restart-redis: ## Restart Redis only
	$(COMPOSE) restart redis

restart-pgadmin: ## Restart pgAdmin only
	$(COMPOSE) restart pgadmin

restart-user-service: ## Rebuild & restart user service (picks up code changes)
	$(COMPOSE) up -d --build user-service

restart-event-service: ## Rebuild & restart event service (picks up code changes)
	$(COMPOSE) up -d --build event-service

restart-cloudflared: ## Restart Cloudflare tunnel
	$(COMPOSE) restart cloudflared

restart-mfe-admin: ## Rebuild & restart mfe-admin container
	$(COMPOSE) --profile frontend up -d --build mfe-admin

restart-mfe-events: ## Rebuild & restart mfe-events container
	$(COMPOSE) --profile frontend up -d --build mfe-events

restart-mfe-booking: ## Rebuild & restart mfe-booking container
	$(COMPOSE) --profile frontend up -d --build mfe-booking

restart-mfe-payment: ## Rebuild & restart mfe-payment container
	$(COMPOSE) --profile frontend up -d --build mfe-payment

restart-splunk: ## Restart Splunk only (monitoring profile)
	$(COMPOSE) --profile monitoring restart splunk

restart-fluent-bit: ## Restart Fluent Bit only (monitoring profile)
	$(COMPOSE) --profile monitoring restart fluent-bit

## ── Monitoring stack ────────────────────────────────────────────────────────
monitoring-up: ## Start Splunk + Fluent Bit monitoring stack
	$(COMPOSE) --profile monitoring up -d splunk fluent-bit
	@echo ""
	@echo "  $(CYAN)Monitoring stack starting… [$(ENV)]$(RESET)"
	@echo "  Splunk UI → http://localhost:$$(grep -m1 '^NGINX_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]')/splunk/"
	@echo "  Run 'make logs-splunk ENV=$(ENV)' to follow Splunk startup logs."
	@echo ""

monitoring-down: ## Stop Splunk + Fluent Bit monitoring stack
	$(COMPOSE) --profile monitoring stop splunk fluent-bit

splunk-up: ## Start Splunk only (without Fluent Bit)
	$(COMPOSE) --profile monitoring up -d splunk

splunk-down: ## Stop Splunk only
	$(COMPOSE) --profile monitoring stop splunk

fluent-bit-up: ## Start Fluent Bit only (Splunk must already be running)
	$(COMPOSE) --profile monitoring up -d fluent-bit

fluent-bit-down: ## Stop Fluent Bit only
	$(COMPOSE) --profile monitoring stop fluent-bit

## ── Status ──────────────────────────────────────────────────────────────────
ps: ## Show service status and health
	$(COMPOSE) ps

## ── Logs ────────────────────────────────────────────────────────────────────
logs: ## Follow logs for all running services
	$(COMPOSE) logs -f

logs-nginx: ## Follow nginx logs only
	$(COMPOSE) logs -f nginx

logs-kc: ## Follow Keycloak logs only
	$(COMPOSE) logs -f keycloak

logs-db: ## Follow Postgres logs only
	$(COMPOSE) logs -f postgres

logs-user: ## Follow user service logs only
	$(COMPOSE) logs -f user-service

logs-events: ## Follow event service logs only
	$(COMPOSE) logs -f event-service

logs-cloudflared: ## Follow Cloudflare tunnel logs
	$(COMPOSE) logs -f cloudflared

logs-mfe-admin: ## Follow mfe-admin logs
	$(COMPOSE) --profile frontend logs -f mfe-admin

logs-mfe-events: ## Follow mfe-events logs
	$(COMPOSE) --profile frontend logs -f mfe-events

logs-mfe-booking: ## Follow mfe-booking logs
	$(COMPOSE) --profile frontend logs -f mfe-booking

logs-mfe-payment: ## Follow mfe-payment logs
	$(COMPOSE) --profile frontend logs -f mfe-payment

logs-splunk: ## Follow Splunk logs (monitoring profile)
	$(COMPOSE) --profile monitoring logs -f splunk

logs-fluent-bit: ## Follow Fluent Bit logs (monitoring profile)
	$(COMPOSE) --profile monitoring logs -f fluent-bit

## ── Database ────────────────────────────────────────────────────────────────
shell-db: ## Open psql in the society_events database
	$(COMPOSE) exec postgres psql -U $$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') -d society_events

shell-redis: ## Open redis-cli (authenticates if REDIS_PASSWORD is set)
	$(COMPOSE) exec redis redis-cli $$(grep -m1 '^REDIS_PASSWORD=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' | grep -q . && echo "-a $$(grep -m1 '^REDIS_PASSWORD=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]')") --no-auth-warning

seed: ## Re-run only the seed script (idempotent — uses ON CONFLICT DO NOTHING)
	$(COMPOSE) exec -T postgres \
	  psql -U $$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') -d society_events \
	  -f /docker-entrypoint-initdb.d/02_seed.sql
	@echo "Seed complete."

migrate: ## Run pending SQL migrations in db/migrations/ (idempotent)
	@for f in db/migrations/*.sql; do \
	  echo "Running $$f…"; \
	  $(COMPOSE) exec -T postgres psql \
	    -U $$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') \
	    -d society_events -f /dev/stdin < $$f; \
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
	  -e POSTGRES_USER=$$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') \
	  -e POSTGRES_PASSWORD=$$(grep -m1 '^POSTGRES_PASSWORD=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') \
	  -e REALM_JSON_PATH=/realm.json \
	  python:3.12-alpine \
	  sh -c "pip install psycopg2-binary -q && python /sync.py"

## ── Reset ───────────────────────────────────────────────────────────────────
reset: ## ⚠ Destroy ALL volumes for the active env, restart from scratch, then sync users
	@echo "$(CYAN)Stopping containers and removing volumes… [$(ENV)]$(RESET)"
	$(COMPOSE) --profile frontend --profile monitoring down -v --remove-orphans
	@$(MAKE) -s validate-ports ENV=$(ENV)
	@$(MAKE) -s free-ports ENV=$(ENV)
	$(COMPOSE) --profile frontend up -d --build
	@echo "$(CYAN)Waiting for postgres to be healthy…$(RESET)"
	@until $(COMPOSE) exec -T postgres pg_isready \
	    -U $$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') \
	    -d society_events -q; do sleep 2; done
	@$(MAKE) sync-users ENV=$(ENV)
	@echo "$(CYAN)Fresh [$(ENV)] environment ready.$(RESET)"

## ── Frontend ────────────────────────────────────────────────────────────────
frontend: ## Start the Shell App dev server on http://localhost:3000 (hot-reload)
	cd frontend/shell && npm install && npm run dev

frontend-install: ## Install frontend dependencies only
	cd frontend/shell && npm install

frontend-docker: ## Build and run all production frontend containers (served by nginx at /)
	$(COMPOSE) --profile frontend build --no-cache frontend mfe-admin mfe-events mfe-booking mfe-payment
	$(COMPOSE) --profile frontend up -d frontend mfe-admin mfe-events mfe-booking mfe-payment
