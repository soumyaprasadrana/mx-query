from __future__ import annotations

from tests.conftest import create_tenant

PAYLOAD = {"osName": "MXAPIWO", "select": ["wonum", "description"], "where": {"conditions": []}}


def test_saved_queries_404_for_unknown_tenant(client):
    assert client.get("/api/tenants/does-not-exist/saved-queries").status_code == 404


def test_create_list_get_query(client, fake_mcp_client):
    tid = create_tenant(client)["id"]
    created = client.post(
        f"/api/tenants/{tid}/saved-queries",
        json={"name": "Open WOs", "osName": "MXAPIWO", "payload": PAYLOAD, "tags": ["workorder", "open"]},
    )
    assert created.status_code == 201
    assert created.json()["payload"] == PAYLOAD
    assert created.json()["folderId"] is None  # defaults to Stash

    listing = client.get(f"/api/tenants/{tid}/saved-queries").json()
    assert len(listing) == 1
    assert "payload" not in listing[0]  # list omits payload

    single = client.get(f"/api/tenants/{tid}/saved-queries/{created.json()['id']}")
    assert single.json()["payload"] == PAYLOAD


def test_create_validates_required_fields(client, fake_mcp_client):
    tid = create_tenant(client)["id"]
    res = client.post(f"/api/tenants/{tid}/saved-queries", json={"name": "", "osName": "X", "payload": {}})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "query_bad_name"

    res2 = client.post(f"/api/tenants/{tid}/saved-queries", json={"name": "N", "osName": "", "payload": {}})
    assert res2.status_code == 400
    assert res2.json()["error"]["code"] == "query_bad_os_name"


def test_folder_crud_and_query_in_folder(client, fake_mcp_client):
    tid = create_tenant(client)["id"]
    folder = client.post(f"/api/tenants/{tid}/saved-query-folders", json={"name": "Work Orders"}).json()

    created = client.post(
        f"/api/tenants/{tid}/saved-queries",
        json={"name": "Closed WOs", "osName": "MXAPIWO", "payload": PAYLOAD, "folderId": folder["id"]},
    ).json()
    assert created["folderId"] == folder["id"]

    in_folder = client.get(f"/api/tenants/{tid}/saved-queries?folderId={folder['id']}").json()
    assert [q["id"] for q in in_folder] == [created["id"]]

    stash_only = client.get(f"/api/tenants/{tid}/saved-queries?folderId=stash").json()
    assert stash_only == []


def test_deleting_a_folder_unfiles_its_queries_not_deletes_them(client, fake_mcp_client):
    tid = create_tenant(client)["id"]
    folder = client.post(f"/api/tenants/{tid}/saved-query-folders", json={"name": "F"}).json()
    q = client.post(
        f"/api/tenants/{tid}/saved-queries",
        json={"name": "Q", "osName": "MXAPIWO", "payload": PAYLOAD, "folderId": folder["id"]},
    ).json()

    assert client.delete(f"/api/tenants/{tid}/saved-query-folders/{folder['id']}").status_code == 204
    assert client.get(f"/api/tenants/{tid}/saved-query-folders").json() == []

    survivor = client.get(f"/api/tenants/{tid}/saved-queries/{q['id']}").json()
    assert survivor["folderId"] is None  # unfiled, not gone


def test_update_query_name_tags_and_folder(client, fake_mcp_client):
    tid = create_tenant(client)["id"]
    q = client.post(
        f"/api/tenants/{tid}/saved-queries", json={"name": "Q", "osName": "MXAPIWO", "payload": PAYLOAD}
    ).json()
    folder = client.post(f"/api/tenants/{tid}/saved-query-folders", json={"name": "F"}).json()

    updated = client.patch(
        f"/api/tenants/{tid}/saved-queries/{q['id']}",
        json={"name": "Renamed", "tags": ["a", "b"], "folderId": folder["id"]},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "Renamed"
    assert sorted(body["tags"]) == ["a", "b"]
    assert body["folderId"] == folder["id"]


def test_patch_without_folder_id_leaves_folder_unchanged(client, fake_mcp_client):
    tid = create_tenant(client)["id"]
    folder = client.post(f"/api/tenants/{tid}/saved-query-folders", json={"name": "F"}).json()
    q = client.post(
        f"/api/tenants/{tid}/saved-queries",
        json={"name": "Q", "osName": "MXAPIWO", "payload": PAYLOAD, "folderId": folder["id"]},
    ).json()

    updated = client.patch(f"/api/tenants/{tid}/saved-queries/{q['id']}", json={"name": "Renamed only"})
    assert updated.json()["folderId"] == folder["id"]


def test_search_by_tag_name_and_os(client, fake_mcp_client):
    tid = create_tenant(client)["id"]
    client.post(
        f"/api/tenants/{tid}/saved-queries",
        json={"name": "Open WOs", "osName": "MXAPIWO", "payload": PAYLOAD, "tags": ["open"]},
    )
    client.post(
        f"/api/tenants/{tid}/saved-queries",
        json={"name": "Closed WOs", "osName": "MXAPIWO", "payload": PAYLOAD, "tags": ["closed"]},
    )
    client.post(
        f"/api/tenants/{tid}/saved-queries",
        json={"name": "Assets", "osName": "MXAPIASSET", "payload": PAYLOAD},
    )

    assert len(client.get(f"/api/tenants/{tid}/saved-queries?tag=closed").json()) == 1
    assert len(client.get(f"/api/tenants/{tid}/saved-queries?q=Open").json()) == 1
    assert len(client.get(f"/api/tenants/{tid}/saved-queries?osName=MXAPIWO").json()) == 2
    assert sorted(client.get(f"/api/tenants/{tid}/saved-queries/tags").json()) == ["closed", "open"]


def test_bulk_clear_stash_all_and_folder(client, fake_mcp_client):
    tid = create_tenant(client)["id"]
    folder = client.post(f"/api/tenants/{tid}/saved-query-folders", json={"name": "F"}).json()
    client.post(f"/api/tenants/{tid}/saved-queries", json={"name": "A", "osName": "X", "payload": PAYLOAD})
    client.post(f"/api/tenants/{tid}/saved-queries", json={"name": "B", "osName": "X", "payload": PAYLOAD})
    client.post(
        f"/api/tenants/{tid}/saved-queries",
        json={"name": "C", "osName": "X", "payload": PAYLOAD, "folderId": folder["id"]},
    )

    # folderId is required — no silent "delete everything" default.
    assert client.delete(f"/api/tenants/{tid}/saved-queries").status_code == 422

    cleared_stash = client.delete(f"/api/tenants/{tid}/saved-queries?folderId=stash")
    assert cleared_stash.json() == {"deleted": 2}
    assert [q["name"] for q in client.get(f"/api/tenants/{tid}/saved-queries").json()] == ["C"]

    cleared_all = client.delete(f"/api/tenants/{tid}/saved-queries?folderId=all")
    assert cleared_all.json() == {"deleted": 1}
    assert client.get(f"/api/tenants/{tid}/saved-queries").json() == []
    # The folder itself survives a bulk clear — only its contents are gone.
    assert client.get(f"/api/tenants/{tid}/saved-query-folders").json() != []
