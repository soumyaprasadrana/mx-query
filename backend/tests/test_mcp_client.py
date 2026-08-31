from __future__ import annotations

from app.mcp.client import MaximoMCPClient


def _client(**overrides) -> MaximoMCPClient:
    kwargs = dict(url="https://example/maximo", api_key="k", data_dir="/tmp/d", logs_dir="/tmp/l")
    kwargs.update(overrides)
    return MaximoMCPClient(**kwargs)


def test_uses_global_bin_when_present(monkeypatch):
    monkeypatch.setattr("app.mcp.client.shutil.which", lambda name: "/usr/bin/maximo-mcp-server")
    params = _client()._server_params()
    assert params.command == "/usr/bin/maximo-mcp-server"
    assert "npx" not in params.args
    assert params.args[0] == "--data-dir"


def test_falls_back_to_npx_when_no_global_bin(monkeypatch):
    monkeypatch.setattr("app.mcp.client.shutil.which", lambda name: None)
    params = _client()._server_params()
    assert params.command == "npx"
    assert params.args[0] == "-y"
    assert params.args[1] == "@soumyaprasadrana/maximo-mcp-server@1.4.6"


def test_mcp_cli_path_wins_over_global_bin(monkeypatch):
    monkeypatch.setenv("MQB_MCP_CLI_PATH", "/repo/cli.js")
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr("app.mcp.client.shutil.which", lambda name: "/usr/bin/maximo-mcp-server")
    try:
        params = _client()._server_params()
        assert params.command == "node"
        assert params.args[0] == "/repo/cli.js"
    finally:
        get_settings.cache_clear()
