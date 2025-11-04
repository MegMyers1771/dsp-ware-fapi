from fastapi.testclient import TestClient

def test_root(client: TestClient):
    r = client.get("/")
    assert r.status_code == 404
