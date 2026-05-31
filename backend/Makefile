.PHONY: setup dev

setup:
	python -m venv .venv
	.venv\Scripts\pip install -r requirements.txt
	copy .env.example .env
	@echo.
	@echo Setup complete. Fill in .env then run: make dev

dev:
	.venv\Scripts\uvicorn main:app --reload --port 8000
