from __future__ import annotations

import pytest

from app import cli, db


@pytest.fixture()
def cli_env(scratch_db_path, monkeypatch):
    """Same scratch-db isolation as the `app` fixture (AGENTS.md rule 6),
    without spinning up a FastAPI app — the CLI talks to db.py/manager.py
    directly, never through HTTP."""
    monkeypatch.setenv("MQB_TENANT_DB_PATH", scratch_db_path)
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_add_tenant_registers_and_reports_ready(cli_env, fake_mcp_client, capsys):
    rc = cli.main(
        ["add-tenant", "--name", "Prod", "--url", "http://localhost:9080/maximo", "--api-key", "k"]
    )
    assert rc == 0
    out = capsys.readouterr().out
    assert "Created tenant" in out
    assert "is ready" in out

    tenants = db.list_tenants()
    assert len(tenants) == 1
    assert tenants[0].name == "Prod"


def test_list_tenants_reports_none_when_empty(cli_env, capsys):
    rc = cli.main(["list-tenants"])
    assert rc == 0
    assert "No tenants." in capsys.readouterr().out


def test_list_tenants_shows_created_tenant(cli_env, fake_mcp_client, capsys):
    cli.main(["add-tenant", "--name", "Prod", "--url", "http://x", "--api-key", "k"])
    capsys.readouterr()
    rc = cli.main(["list-tenants"])
    assert rc == 0
    assert "Prod" in capsys.readouterr().out


def test_resync_404s_for_unknown_tenant(cli_env, capsys):
    rc = cli.main(["resync", "does-not-exist"])
    assert rc == 1
    assert "No tenant" in capsys.readouterr().err


def test_resync_reports_ready_for_existing_tenant(cli_env, fake_mcp_client, capsys):
    cli.main(["add-tenant", "--name", "Prod", "--url", "http://x", "--api-key", "k"])
    tenant_id = db.list_tenants()[0].id
    capsys.readouterr()

    rc = cli.main(["resync", tenant_id])
    assert rc == 0
    assert "is ready" in capsys.readouterr().out
    assert any(c.get("force_reconcile") for c in fake_mcp_client)
