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
        setup-otp setup-otp-keycloak otp-secret logs-otp restart-otp-service \
        frontend frontend-install frontend-docker \
        restart-nginx restart-keycloak restart-postgres restart-redis \
        restart-pgadmin restart-user-service restart-event-service restart-cloudflared \
        restart-otp-service \
        restart-mfe-admin restart-mfe-events restart-mfe-booking restart-mfe-payment \
        restart-splunk restart-fluent-bit \
        logs-nginx logs-kc logs-db logs-user logs-events logs-otp \
        logs-cloudflared logs-mfe-admin logs-mfe-events logs-mfe-booking logs-mfe-payment \
        logs-splunk logs-fluent-bit \
        _check-monitoring monitoring-up monitoring-down \
        splunk-up splunk-down fluent-bit-up fluent-bit-down

## ── Environment ─────────────────────────────────────────────────────────────
# ENV=prod   → docker-compose.yml + docker-compose.monitoring.yml + docker-compose.prod.yml
# ENV=stage  → docker-compose.yml + docker-compose.monitoring.yml
# ENV=dev    → docker-compose.yml  (no Splunk, no Cloudflared)
# ENV=test   → docker-compose.yml  (no Splunk, no Cloudflared)
ENV              ?= prod
ENV_FILE         := $(if $(filter prod,$(ENV)),.env,.env.$(ENV))

ifeq ($(ENV),prod)
  COMPOSE_FILES := -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.prod.yml
else ifeq ($(ENV),stage)
  COMPOSE_FILES := -f docker-compose.yml -f docker-compose.monitoring.yml
else
  COMPOSE_FILES := -f docker-compose.yml
endif

COMPOSE          := docker compose --env-file $(ENV_FILE) $(COMPOSE_FILES)
COMPOSE_PROJECT  := $(shell grep -m1 '^COMPOSE_PROJECT_NAME=' $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d '"[:space:]' || echo society)
POSTGRES_DB_NAME := $(shell grep -m1 '^POSTGRES_DB=' $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d '"[:space:]' || echo society_events)

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
	@echo "  Activating host port bindings…"
	@$(COMPOSE) restart nginx keycloak 2>/dev/null || true
	@echo "  Starting Cloudflare tunnel…"
	@docker compose --env-file $(ENV_FILE) -f docker-compose.yml -f docker-compose.prod.yml up -d cloudflared 2>/dev/null || true
	@echo ""
	@_splunk_pw=$$(grep -m1 '^SPLUNK_PASSWORD=' $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d '"[:space:]'); \
	_pub=$$(grep -m1 '^KEYCLOAK_PUBLIC_URL=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]'); \
	 _port=$$(grep -m1 '^NGINX_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo 8080); \
	 _kc_port=$$(grep -m1 '^KEYCLOAK_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo 8081); \
	 if echo "$$_pub" | grep -qv "localhost\|127\.0\.0\.1"; then \
	   _site="$$_pub"; \
	   _kc_admin="http://localhost:$$_kc_port/admin/"; \
	 else \
	   _site="http://localhost:$$_port"; \
	   _kc_admin="http://localhost:$$_kc_port/admin/"; \
	 fi; \
	 echo ""; \
	 echo "  $(CYAN)[$(ENV)] Services starting…$(RESET)"; \
	 echo "  Env file  → $(ENV_FILE)"; \
	 echo "  Frontend  → $$_site/"; \
	 echo "  Keycloak  → $$_kc_admin (direct — bypasses nginx)"; \
	 echo ""; \
	 echo "  $(CYAN)Browser pages$(RESET)"; \
	 echo "  App home         → $$_site/"; \
	 echo "  Forgot password  → $$_site/forgot-password"; \
	 echo "  Profile          → $$_site/profile"; \
	 echo "  Events           → $$_site/events"; \
	 echo "  Tickets          → $$_site/tickets"; \
	 echo "  Checkout         → $$_site/checkout"; \
	 echo "  Payments         → $$_site/payments"; \
	 echo "  Event manager    → $$_site/manage"; \
	 echo "  Admin panel      → $$_site/admin"; \
	 echo "  Sponsor portal   → $$_site/sponsor"; \
	 echo "  QR scanner       → $$_site/scanner"; \
	 echo "  Entry log        → $$_site/entry-log"; \
	 echo ""; \
	 echo "  $(CYAN)Admin / docs$(RESET)"; \
	 echo "  Keycloak admin   → $$_kc_admin"; \
	 echo "  pgAdmin          → $$_site/pgadmin/"; \
	 if [ -n "$$_splunk_pw" ]; then echo "  Splunk           → $$_site/splunk/"; fi; \
	 echo "  User API docs    → $$_site/api/users/docs"; \
	 echo "  Event API docs   → $$_site/api/events/docs"; \
	 echo "  OTP Bridge docs  → $$_site/api/otp/docs"; \
	 echo ""; \
	 echo "  $(CYAN)MFE preview roots$(RESET)"; \
	 echo "  Admin MFE        → $$_site/mfe-admin/"; \
	 echo "  Events MFE       → $$_site/mfe-events/"; \
	 echo "  Booking MFE      → $$_site/mfe-booking/"; \
	 echo "  Payment MFE      → $$_site/mfe-payment/"; \
	 echo "  Run 'make logs ENV=$(ENV)' to follow logs."; \
	 echo ""

down: ## Stop and remove all containers for the active environment
	$(COMPOSE) --profile frontend down --remove-orphans
	@$(MAKE) -s free-ports ENV=$(ENV)

fix-ports: ## Re-bind host ports when localhost stops responding (WSL2/Podman rootlessport dies)
	@echo "Restarting port forwarders…"
	@$(COMPOSE) restart nginx keycloak 2>/dev/null || true
	@echo "  Port 8080: $$(ss -tlnp | grep -c ':8080' && echo ok || echo FAILED)"
	@echo "  Port 8081: $$(ss -tlnp | grep -c ':8081' && echo ok || echo FAILED)"

setup-email: ## Configure Keycloak SMTP (Gmail) — set GMAIL_SMTP_USER + GMAIL_APP_PASSWORD in env file first
	@_user=$$(grep -m1 '^GMAIL_SMTP_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]'); \
	_pass=$$(grep -m1 '^GMAIL_APP_PASSWORD=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]'); \
	_kc_user=$$(grep -m1 '^KEYCLOAK_ADMIN_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo admin); \
	_kc_pass=$$(grep -m1 '^KEYCLOAK_ADMIN_PASSWORD=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]'); \
	_kc_port=$$(grep -m1 '^KEYCLOAK_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo 8081); \
	_realm=$$(grep -m1 '^KEYCLOAK_REALM=' $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d '"[:space:]'); \
	[ -z "$$_realm" ] && _realm=society-events; \
	if [ -z "$$_user" ] || [ -z "$$_pass" ]; then \
	  echo "$(CYAN)ERROR: Set GMAIL_SMTP_USER and GMAIL_APP_PASSWORD in $(ENV_FILE) first$(RESET)"; \
	  exit 1; \
	fi; \
	echo "  Obtaining Keycloak admin token…"; \
	_token=$$(curl -s -X POST "http://localhost:$$_kc_port/realms/master/protocol/openid-connect/token" \
	  -d "client_id=admin-cli&grant_type=password&username=$$_kc_user&password=$$_kc_pass" \
	  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null); \
	if [ -z "$$_token" ]; then echo "$(CYAN)ERROR: Could not get Keycloak admin token$(RESET)"; exit 1; fi; \
	echo "  Configuring SMTP for realm $$_realm…"; \
	curl -s -X PUT "http://localhost:$$_kc_port/admin/realms/$$_realm" \
	  -H "Authorization: Bearer $$_token" \
	  -H "Content-Type: application/json" \
	  -d "{\"smtpServer\":{\"host\":\"smtp.gmail.com\",\"port\":\"587\",\"from\":\"$$_user\",\"fromDisplayName\":\"GM Global Techies Town\",\"auth\":\"true\",\"ssl\":\"false\",\"starttls\":\"true\",\"user\":\"$$_user\",\"password\":\"$$_pass\"}}" \
	  -o /dev/null -w "%{http_code}" | grep -q '204' \
	  && echo "  $(CYAN)SMTP configured — test by running: make test-email ENV=$(ENV)$(RESET)" \
	  || echo "  $(CYAN)ERROR: SMTP update failed$(RESET)"

test-email: ## Send a test reset email to GMAIL_SMTP_USER (verifies SMTP works)
	@_user=$$(grep -m1 '^GMAIL_SMTP_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]'); \
	_kc_user=$$(grep -m1 '^KEYCLOAK_ADMIN_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo admin); \
	_kc_pass=$$(grep -m1 '^KEYCLOAK_ADMIN_PASSWORD=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]'); \
	_kc_port=$$(grep -m1 '^KEYCLOAK_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo 8081); \
	_realm=$$(grep -m1 '^KEYCLOAK_REALM=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo society-events); \
	_pub=$$(grep -m1 '^KEYCLOAK_PUBLIC_URL=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]'); \
	_token=$$(curl -s -X POST "http://localhost:$$_kc_port/realms/master/protocol/openid-connect/token" \
	  -d "client_id=admin-cli&grant_type=password&username=$$_kc_user&password=$$_kc_pass" \
	  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null); \
	_uid=$$(curl -s "http://localhost:$$_kc_port/admin/realms/$$_realm/users?email=$$_user&exact=true" \
	  -H "Authorization: Bearer $$_token" \
	  | python3 -c "import sys,json; u=json.load(sys.stdin); print(u[0]['id'] if u else '')" 2>/dev/null); \
	if [ -z "$$_uid" ]; then echo "$(CYAN)User $$_user not found in Keycloak$(RESET)"; exit 1; fi; \
	curl -s -X PUT "http://localhost:$$_kc_port/admin/realms/$$_realm/users/$$_uid/execute-actions-email" \
	  -H "Authorization: Bearer $$_token" -H "Content-Type: application/json" \
	  -G --data-urlencode "client_id=society-frontend" --data-urlencode "redirect_uri=$$_pub/" \
	  -d '["UPDATE_PASSWORD"]' -w "\nHTTP %{http_code}\n" \
	  && echo "  $(CYAN)Reset email sent to $$_user$(RESET)"

restart: ## Restart all core services (rebuilds changed images)
	$(COMPOSE) --profile frontend up -d --build

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

restart-cloudflared: ## Start/restart Cloudflare tunnel (works for any ENV)
	docker compose --env-file $(ENV_FILE) -f docker-compose.yml -f docker-compose.prod.yml up -d cloudflared

restart-mfe-admin: ## Rebuild & restart mfe-admin container
	$(COMPOSE) --profile frontend up -d --build mfe-admin

restart-mfe-events: ## Rebuild & restart mfe-events container
	$(COMPOSE) --profile frontend up -d --build mfe-events

restart-mfe-booking: ## Rebuild & restart mfe-booking container
	$(COMPOSE) --profile frontend up -d --build mfe-booking

restart-mfe-payment: ## Rebuild & restart mfe-payment container
	$(COMPOSE) --profile frontend up -d --build mfe-payment

restart-splunk: ## Restart Splunk only (stage/prod)
	$(COMPOSE) restart splunk

restart-fluent-bit: ## Restart Fluent Bit only (stage/prod)
	$(COMPOSE) restart fluent-bit

## ── Monitoring stack (stage / prod only) ────────────────────────────────────
_check-monitoring:
	@if [ "$(ENV)" != "stage" ] && [ "$(ENV)" != "prod" ]; then \
	  echo "  ERROR: monitoring targets require ENV=stage or ENV=prod (got ENV=$(ENV))"; \
	  exit 1; \
	fi

monitoring-up: _check-monitoring ## Start Splunk + Fluent Bit (ENV=stage|prod)
	$(COMPOSE) up -d splunk fluent-bit
	@echo ""
	@echo "  $(CYAN)Monitoring stack starting… [$(ENV)]$(RESET)"
	@echo "  Splunk UI → http://localhost:$$(grep -m1 '^NGINX_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]')/splunk/"
	@echo "  Run 'make logs-splunk ENV=$(ENV)' to follow Splunk startup logs."
	@echo ""

monitoring-down: _check-monitoring ## Stop Splunk + Fluent Bit (ENV=stage|prod)
	$(COMPOSE) stop splunk fluent-bit

splunk-up: _check-monitoring ## Start Splunk only (ENV=stage|prod)
	$(COMPOSE) up -d splunk

splunk-down: _check-monitoring ## Stop Splunk only (ENV=stage|prod)
	$(COMPOSE) stop splunk

fluent-bit-up: _check-monitoring ## Start Fluent Bit only — Splunk must already be running
	$(COMPOSE) up -d fluent-bit

fluent-bit-down: _check-monitoring ## Stop Fluent Bit only (ENV=stage|prod)
	$(COMPOSE) stop fluent-bit

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

logs-splunk: ## Follow Splunk logs (ENV=stage|prod)
	$(COMPOSE) logs -f splunk

logs-fluent-bit: ## Follow Fluent Bit logs (ENV=stage|prod)
	$(COMPOSE) logs -f fluent-bit

## ── Database ────────────────────────────────────────────────────────────────
shell-db: ## Open psql in the active environment's database
	$(COMPOSE) exec postgres psql -U $$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') -d $(POSTGRES_DB_NAME)

shell-redis: ## Open redis-cli (authenticates if REDIS_PASSWORD is set)
	$(COMPOSE) exec redis redis-cli $$(grep -m1 '^REDIS_PASSWORD=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' | grep -q . && echo "-a $$(grep -m1 '^REDIS_PASSWORD=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]')") --no-auth-warning

seed: ## Re-run only the seed script (idempotent — uses ON CONFLICT DO NOTHING)
	$(COMPOSE) exec -T postgres \
	  psql -U $$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') -d $(POSTGRES_DB_NAME) \
	  -f /docker-entrypoint-initdb.d/02_seed.sql
	@echo "Seed complete."

migrate: ## Run pending SQL migrations in db/migrations/ (idempotent)
	@for f in db/migrations/*.sql; do \
	  echo "Running $$f…"; \
	  $(COMPOSE) exec -T postgres psql \
	    -U $$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') \
	    -d $(POSTGRES_DB_NAME) -f /dev/stdin < $$f; \
	done
	@echo "Migrations complete."

setup-google-idp: ## Apply Google IDP + first-broker-login flow to the RUNNING Keycloak (idempotent)
	python3 scripts/setup_google_idp.py

## ── OTP / Mobile login setup ─────────────────────────────────────────────────
# All three sub-steps of setup-otp are idempotent — safe to re-run.

otp-secret: check-env ## Generate a fresh OTP_BRIDGE_CLIENT_SECRET and add it to the active env file
	@_f=$(ENV_FILE); \
	if grep -q '^OTP_BRIDGE_CLIENT_SECRET=' "$$_f" 2>/dev/null; then \
	  echo "  OTP_BRIDGE_CLIENT_SECRET already set in $$_f — delete the line to regenerate."; \
	else \
	  _secret=$$(python3 -c 'import secrets; print(secrets.token_hex(32))'); \
	  echo "" >> "$$_f"; \
	  echo "# ─── OTP Bridge Service ────────────────────────────────────────────────────" >> "$$_f"; \
	  echo "OTP_BRIDGE_CLIENT_SECRET=$$_secret" >> "$$_f"; \
	  echo "SMS_GATEWAY=log" >> "$$_f"; \
	  echo "  $(CYAN)OTP_BRIDGE_CLIENT_SECRET added to $$_f$(RESET)"; \
	fi

setup-otp-keycloak: check-env ## Register otp-bridge client in Keycloak and grant impersonation (idempotent)
	@_secret=$$(grep -m1 '^OTP_BRIDGE_CLIENT_SECRET=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]'); \
	_kc_admin=$$(grep -m1 '^KEYCLOAK_ADMIN_USER=' $(ENV_FILE) | cut -d= -f2- | tr -d '"[:space:]' || echo admin); \
	_kc_pass=$$(grep -m1 '^KEYCLOAK_ADMIN_PASSWORD=' $(ENV_FILE) | cut -d= -f2- | tr -d '"[:space:]'); \
	_kc_port=$$(grep -m1 '^KEYCLOAK_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo 8081); \
	if [ -z "$$_secret" ]; then \
	  echo "  ERROR: OTP_BRIDGE_CLIENT_SECRET not set in $(ENV_FILE). Run: make otp-secret ENV=$(ENV)"; \
	  exit 1; \
	fi; \
	echo "  $(CYAN)[1/3] Authenticating kcadm…$(RESET)"; \
	$(COMPOSE) exec -T keycloak \
	  /opt/keycloak/bin/kcadm.sh config credentials \
	  --server "http://localhost:$$_kc_port" --realm master \
	  --user "$$_kc_admin" --password "$$_kc_pass"; \
	echo "  $(CYAN)[2/3] Creating / updating otp-bridge client…$(RESET)"; \
	_exists=$$($(COMPOSE) exec -T keycloak \
	  /opt/keycloak/bin/kcadm.sh get clients -r society-events \
	  --fields clientId 2>/dev/null | grep -c 'otp-bridge' || echo 0); \
	if [ "$$_exists" -eq 0 ]; then \
	  $(COMPOSE) exec -T keycloak \
	    /opt/keycloak/bin/kcadm.sh create clients -r society-events \
	    -s clientId=otp-bridge -s 'name=OTP Bridge Service' \
	    -s enabled=true -s publicClient=false \
	    -s serviceAccountsEnabled=true \
	    -s directAccessGrantsEnabled=false \
	    -s standardFlowEnabled=false \
	    -s "secret=$$_secret"; \
	  echo "    otp-bridge client created."; \
	else \
	  _cid=$$($(COMPOSE) exec -T keycloak \
	    /opt/keycloak/bin/kcadm.sh get clients -r society-events \
	    --fields id,clientId 2>/dev/null \
	    | grep -A2 '"otp-bridge"' | grep '"id"' \
	    | sed 's/.*: "//;s/".*//'); \
	  $(COMPOSE) exec -T keycloak \
	    /opt/keycloak/bin/kcadm.sh update "clients/$$_cid" \
	    -r society-events -s "secret=$$_secret"; \
	  echo "    otp-bridge secret refreshed (client already existed)."; \
	fi; \
	echo "  $(CYAN)[3/3] Granting impersonation role to service account…$(RESET)"; \
	$(COMPOSE) exec -T keycloak \
	  /opt/keycloak/bin/kcadm.sh add-roles -r society-events \
	  --uusername service-account-otp-bridge \
	  --cclientid realm-management \
	  --rolename impersonation 2>&1 | grep -v 'already' || true; \
	echo "  $(CYAN)Keycloak otp-bridge setup complete.$(RESET)"

setup-otp: check-env ## Full OTP setup: generate secret → migrate DB → Keycloak client → build service (idempotent)
	@echo ""
	@echo "  $(CYAN)─── Mobile OTP Setup [$(ENV)] ───$(RESET)"
	@echo ""
	@$(MAKE) -s otp-secret ENV=$(ENV)
	@echo "  $(CYAN)[Step 2/4] Running DB migration 002_mobile_otp.sql…$(RESET)"
	@$(COMPOSE) exec -T postgres psql \
	  -U $$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') \
	  -d $(POSTGRES_DB_NAME) -f /dev/stdin < db/migrations/002_mobile_otp.sql
	@echo "  DB migration applied."
	@echo "  $(CYAN)[Step 3/4] Configuring Keycloak otp-bridge client…$(RESET)"
	@$(MAKE) -s setup-otp-keycloak ENV=$(ENV)
	@echo "  $(CYAN)[Step 4/4] Building & starting otp-service…$(RESET)"
	@$(COMPOSE) up -d --build otp-service
	@$(COMPOSE) up -d --build nginx
	@echo ""
	@_port=$$(grep -m1 '^NGINX_PORT=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo 8080); \
	echo "  $(CYAN)OTP setup complete! [$(ENV)]$(RESET)"; \
	echo "  Health : http://localhost:$$_port/api/otp/health"; \
	echo "  Docs   : http://localhost:$$_port/api/otp/docs"; \
	echo ""; \
	echo "  SMS gateway is currently set to: $$(grep -m1 '^SMS_GATEWAY=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]' || echo log)"; \
	echo "  To enable real SMS: set SMS_GATEWAY=gammu in $(ENV_FILE)"; \
	echo "                      and run: make restart-otp-service ENV=$(ENV)"; \
	echo ""

restart-otp-service: ## Rebuild & restart otp-service (picks up code/env changes)
	$(COMPOSE) up -d --build otp-service

logs-otp: ## Follow otp-service logs
	$(COMPOSE) logs -f otp-service

sync-users: ## Sync users from keycloak/realm.json → postgres (inserts only, never overwrites)
	docker run --rm \
	  --network $(COMPOSE_PROJECT)_network \
	  -v $(PWD)/keycloak/realm.json:/realm.json:ro \
	  -v $(PWD)/scripts/sync_keycloak_users.py:/sync.py:ro \
	  -e POSTGRES_HOST=society_postgres \
	  -e POSTGRES_DB=$(POSTGRES_DB_NAME) \
	  -e POSTGRES_USER=$$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') \
	  -e POSTGRES_PASSWORD=$$(grep -m1 '^POSTGRES_PASSWORD=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') \
	  -e REALM_JSON_PATH=/realm.json \
	  python:3.12-alpine \
	  sh -c "pip install psycopg2-binary -q && python /sync.py"

## ── Reset ───────────────────────────────────────────────────────────────────
reset: ## ⚠ Destroy ALL volumes for the active env, restart from scratch, then sync users
	@echo "$(CYAN)Stopping containers and removing volumes… [$(ENV)]$(RESET)"
	$(COMPOSE) --profile frontend down -v --remove-orphans
	@$(MAKE) -s validate-ports ENV=$(ENV)
	@$(MAKE) -s free-ports ENV=$(ENV)
	$(COMPOSE) --profile frontend up -d --build
	@echo "$(CYAN)Waiting for postgres to be healthy…$(RESET)"
	@until $(COMPOSE) exec -T postgres pg_isready \
	    -U $$(grep -m1 '^POSTGRES_USER=' $(ENV_FILE) | cut -d= -f2 | tr -d '"[:space:]') \
	    -d $(POSTGRES_DB_NAME) -q; do sleep 2; done
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
