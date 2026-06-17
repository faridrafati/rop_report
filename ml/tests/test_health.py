from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "drilliq-ml"}


def test_predict_rop_not_implemented():
    payload = {
        "wob": 25.0,
        "rpm": 120.0,
        "torque": 8.0,
        "flow": 600.0,
        "mudWeight": 9.5,
        "tfa": 0.75,
        "depth": 10500.0,
        "lithology": "sandstone",
    }
    resp = client.post("/predict/rop", json=payload)
    assert resp.status_code == 501
    body = resp.json()
    assert body["detail"] == "ROP prediction deferred to Phase 7"
    assert body["predictors_received"]["wob"] == 25.0
