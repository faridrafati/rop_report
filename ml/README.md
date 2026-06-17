# DrillIQ ML Service (DEFERRED — Phase 7)

A minimal FastAPI placeholder microservice for the DrillIQ monorepo.

**ML is deferred.** This service currently exists only to provide a health
check so `docker-compose` has something to build and so the service contract
(routes and request/response shapes) is staked out ahead of the real work.
There are no models, no training, and no sklearn/tensorflow code yet.

## Run locally

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The service listens on http://127.0.0.1:8000 (interactive docs at `/docs`).

### Endpoints

- `GET /health` → `200 {"status": "ok", "service": "drilliq-ml"}`
- `POST /predict/rop` → `501` (stub) — validates and echoes the predictor
  payload, returns `{"detail": "ROP prediction deferred to Phase 7", ...}`

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

## Planned scope (Phase 7)

Rate-Of-Penetration (ROP) prediction using:

- Multiple (linear) regression
- Neural network
- Random forest
- Support Vector Machine (SVM)
- K-Nearest Neighbors (KNN)

Predictor set (domain spec): `wob`, `rpm`, `torque`, `flow`, `mudWeight`,
`tfa`, `depth`, and optional `lithology`.
