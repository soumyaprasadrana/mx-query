from __future__ import annotations

import pytest

from app.mcp.client import MaximoMCPClient, _global_bin_matches_pinned_version, parse_npm_spec


@pytest.fixture(autouse=True)
def _no_force_npx_by_default(monkeypatch):
    """These tests don't use the `app` fixture (no FastAPI app needed), so
    they have none of its env isolation - a developer's real local
    backend/.env (MQB_MCP_FORCE_NPX=true is a genuine, documented local
    override, not a hypothetical) would otherwise silently change which
    branch _server_params() takes here. Force the default explicitly;
    the one test that wants force-npx sets it back within its own body,
    which still wins since it runs after this fixture's setup."""
    monkeypatch.setenv("MQB_MCP_FORCE_NPX", "false")
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _client(**overrides) -> MaximoMCPClient:
    kwargs = dict(url="https://example/maximo", api_key="k", data_dir="/tmp/d", logs_dir="/tmp/l")
    kwargs.update(overrides)
    return MaximoMCPClient(**kwargs)


def test_parse_npm_spec_splits_on_last_at():
    assert parse_npm_spec("@soumyaprasadrana/maximo-mcp-server@1.4.6") == (
        "@soumyaprasadrana/maximo-mcp-server",
        "1.4.6",
    )
    assert parse_npm_spec("no-version-pin") == ("no-version-pin", "")


def test_uses_global_bin_when_version_matches(monkeypatch):
    monkeypatch.setattr("app.mcp.client.shutil.which", lambda name: "/usr/bin/maximo-mcp-server")
    monkeypatch.setattr("app.mcp.client._global_bin_matches_pinned_version", lambda path, spec: True)
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


def test_falls_back_to_npx_when_global_bin_version_mismatches(monkeypatch):
    """The exact real-world scenario this guards against: a stale/unrelated
    global install under the same bin name (e.g. from earlier manual
    testing) must never be silently preferred over npx just because it's on
    PATH - only an exact version match earns that."""
    monkeypatch.setattr("app.mcp.client.shutil.which", lambda name: "/usr/bin/maximo-mcp-server")
    monkeypatch.setattr("app.mcp.client._global_bin_matches_pinned_version", lambda path, spec: False)
    params = _client()._server_params()
    assert params.command == "npx"
    assert params.args[1] == "@soumyaprasadrana/maximo-mcp-server@1.4.6"


def test_force_npx_skips_global_bin_detection_entirely(monkeypatch):
    """MQB_MCP_FORCE_NPX=true must not even call shutil.which - a dev machine
    with a global install (matching version or not) should be fully
    sidestepped, not just correctly detected."""
    monkeypatch.setenv("MQB_MCP_FORCE_NPX", "true")
    from app.config import get_settings

    get_settings.cache_clear()

    def _fail_if_called(name):
        raise AssertionError("shutil.which should not be called when mcp_force_npx is set")

    monkeypatch.setattr("app.mcp.client.shutil.which", _fail_if_called)
    try:
        params = _client()._server_params()
        assert params.command == "npx"
        assert params.args[1] == "@soumyaprasadrana/maximo-mcp-server@1.4.6"
    finally:
        get_settings.cache_clear()


def test_mcp_cli_path_wins_over_global_bin(monkeypatch):
    monkeypatch.setenv("MQB_MCP_CLI_PATH", "/repo/cli.js")
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr("app.mcp.client.shutil.which", lambda name: "/usr/bin/maximo-mcp-server")
    monkeypatch.setattr("app.mcp.client._global_bin_matches_pinned_version", lambda path, spec: True)
    try:
        params = _client()._server_params()
        assert params.command == "node"
        assert params.args[0] == "/repo/cli.js"
    finally:
        get_settings.cache_clear()


def _fake_run(stdout: str):
    class _Result:
        pass

    def run(*args, **kwargs):
        result = _Result()
        result.stdout = stdout
        return result

    return run


def test_global_bin_matches_pinned_version_on_exact_match(monkeypatch):
    monkeypatch.setattr("app.mcp.client.subprocess.run", _fake_run("maximo-mcp-server v1.4.6\n"))
    _global_bin_matches_pinned_version.cache_clear()
    assert _global_bin_matches_pinned_version(
        "/some/unique/path/a", "@soumyaprasadrana/maximo-mcp-server@1.4.6"
    )


def test_global_bin_matches_pinned_version_false_on_mismatch(monkeypatch):
    monkeypatch.setattr("app.mcp.client.subprocess.run", _fake_run("1.2.0\n"))
    _global_bin_matches_pinned_version.cache_clear()
    assert not _global_bin_matches_pinned_version(
        "/some/unique/path/b", "@soumyaprasadrana/maximo-mcp-server@1.4.6"
    )


def test_global_bin_matches_pinned_version_false_when_version_check_fails(monkeypatch):
    def raise_run(*args, **kwargs):
        raise OSError("not executable")

    monkeypatch.setattr("app.mcp.client.subprocess.run", raise_run)
    _global_bin_matches_pinned_version.cache_clear()
    assert not _global_bin_matches_pinned_version(
        "/some/unique/path/c", "@soumyaprasadrana/maximo-mcp-server@1.4.6"
    )
