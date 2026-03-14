PYTHON ?= python
STRATEGY ?= trend_breakout_v1
SEARCH_METHOD ?= grid
MAX_TRIALS ?= 8

.PHONY: dev seed backfill jobs backtest backend-test frontend-test

dev:
	$(PYTHON) scripts/dev.py

seed:
	$(PYTHON) scripts/seed_data.py

backfill:
	$(PYTHON) scripts/backfill.py

jobs:
	$(PYTHON) scripts/local_jobs.py

backtest:
	$(PYTHON) scripts/run_backtest.py --strategy $(STRATEGY) --search-method $(SEARCH_METHOD) --max-trials $(MAX_TRIALS)

backend-test:
	cd apps/backend && pytest

frontend-test:
	cd apps/frontend && npm test -- --run
