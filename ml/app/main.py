"""DrillIQ ML Service.

ML IS DEFERRED — Phase 7.

This module is a HEALTH-CHECK PLACEHOLDER only. It exists so docker-compose
has something to build and so the service contract (routes, request/response
shapes) is staked out ahead of the real implementation. There are NO models,
NO training, and NO sklearn/tensorflow code here yet.

Planned scope (Phase 7) — Rate-Of-Penetration (ROP) prediction via:
    - Multiple (linear) regression
    - Neural network
    - Random forest
    - Support Vector Machine (SVM)
    - K-Nearest Neighbors (KNN)

Predictor set (from the domain spec):
    wob        - weight on bit
    rpm        - rotary speed (revolutions per minute)
    torque     - bit torque
    flow       - flow rate
    mudWeight  - mud weight / density
    tfa        - total flow area (bit nozzles)
    depth      - measured/true depth
    lithology  - optional formation/lithology label
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="DrillIQ ML Service")


class RopPredictors(BaseModel):
    """ROP prediction inputs (domain spec predictor set)."""

    wob: float
    rpm: float
    torque: float
    flow: float
    mudWeight: float
    tfa: float
    depth: float
    lithology: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness/readiness probe."""
    return {"status": "ok", "service": "drilliq-ml"}


@app.post("/predict/rop", status_code=501)
def predict_rop(predictors: RopPredictors) -> JSONResponse:
    """STUB: ROP prediction is deferred to Phase 7.

    Validates and echoes the predictor payload, then returns
    HTTP 501 Not Implemented. No model is invoked.
    """
    return JSONResponse(
        status_code=501,
        content={
            "detail": "ROP prediction deferred to Phase 7",
            "predictors_received": predictors.model_dump(),
        },
    )
