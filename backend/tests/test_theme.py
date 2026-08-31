from __future__ import annotations

GOOD_PACK = {
    "schemaVersion": 1,
    "id": "custom",
    "name": "My Theme",
    "kind": "dark",
    "ootb": False,
    "tokens": {"bg": "#000000", "accent": "#00ffcc", "text": "#ffffff"},
}


def test_get_empty_is_200_not_404(client):
    res = client.get("/api/theme")
    assert res.status_code == 200
    assert res.json() == {"pack": None, "source": None}


def test_put_requires_admin(client):
    assert client.put("/api/theme", json=GOOD_PACK).status_code == 401


def test_put_rejects_wrong_schema_version(admin_client):
    res = admin_client.put("/api/theme", json={**GOOD_PACK, "schemaVersion": 2})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "theme_bad_pack"


def test_put_rejects_bad_kind(admin_client):
    res = admin_client.put("/api/theme", json={**GOOD_PACK, "kind": "purple"})
    assert res.status_code == 400


def test_put_rejects_missing_required_tokens(admin_client):
    res = admin_client.put("/api/theme", json={**GOOD_PACK, "tokens": {"bg": "#000"}})
    assert res.status_code == 400


def test_full_round_trip(admin_client):
    res = admin_client.put("/api/theme", json=GOOD_PACK)
    assert res.status_code == 200
    assert res.json()["pack"] == GOOD_PACK
    assert res.json()["source"] == "db"

    assert admin_client.get("/api/theme").json()["pack"] == GOOD_PACK

    assert admin_client.delete("/api/theme").status_code == 204
    assert admin_client.get("/api/theme").json() == {"pack": None, "source": None}
