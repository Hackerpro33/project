COMPOSE ?= docker compose

.PHONY: dev up down test lint fmt type check ci logs

dev: up
@echo "Local stack is running:"
@echo "  Backend: http://localhost:8000/docs"
@echo "  Frontend: http://localhost:5173"

up:
$(COMPOSE) up -d db redis unleash
$(COMPOSE) up backend frontend

down:
$(COMPOSE) down -v

logs:
$(COMPOSE) logs -f

test:
$(COMPOSE) run --rm backend pytest
$(COMPOSE) run --rm frontend npm test

lint:
$(COMPOSE) run --rm backend bash -c "ruff check app && black --check app"
$(COMPOSE) run --rm frontend npm run lint

fmt:
$(COMPOSE) run --rm backend black app
$(COMPOSE) run --rm frontend npm run lint -- --fix

type:
$(COMPOSE) run --rm backend mypy app

check: lint type test

ci:
$(COMPOSE) down -v --remove-orphans || true
$(COMPOSE) up --build --abort-on-container-exit --renew-anon-volumes backend frontend
