from __future__ import annotations

from app.mcp.manager import ERROR, READY, TenantConfig, TenantMcpManager, parse_status


def test_parse_status_extracts_nested_percent_complete():
    """Real shape (confirmed against the package README's own worked
    example): sync.progress is an OBJECT, not a flat number."""
    snapshot = {
        "sync": {
            "inProgress": True,
            "currentStageName": "Loading schemas",
            "progress": {"percentComplete": 42.5},
        },
        "database": {"counts": {"object_structures": 488}},
    }
    os_count, in_progress, stage, pct = parse_status(snapshot)
    assert os_count == 488
    assert in_progress is True
    assert stage == "Loading schemas"
    assert pct == 42.5


def test_parse_status_percentage_none_when_sync_progress_is_none():
    """Real idle-server shape (a live mcp_server_status call, no sync
    running): sync.progress is null, not an empty object."""
    snapshot = {
        "sync": {"inProgress": False, "currentStageName": None, "progress": None},
        "database": {"counts": {"object_structures": 469}},
    }
    os_count, in_progress, stage, pct = parse_status(snapshot)
    assert os_count == 469
    assert in_progress is False
    assert pct is None


class _ScriptedLoader:
    """A fake MaximoMCPClient returning one scripted snapshot per call,
    repeating the last one once the script is exhausted."""

    def __init__(self, snapshots):
        self._snapshots = snapshots
        self._i = 0

    async def connect(self):
        pass

    async def server_status(self):
        snap = self._snapshots[min(self._i, len(self._snapshots) - 1)]
        self._i += 1
        return snap

    async def aclose(self):
        pass


def _fake_clock(monkeypatch, step: float = 1.0):
    """Deterministic fake clock (+asyncio.sleep no-op) so the warmup loop's
    stall/timeout math resolves in a handful of iterations instead of
    depending on real wall-clock time."""
    import app.mcp.manager as manager_mod

    state = {"t": 0.0}

    def fake_perf_counter():
        state["t"] += step
        return state["t"]

    async def fake_sleep(_seconds):
        return None

    monkeypatch.setattr(manager_mod.time, "perf_counter", fake_perf_counter)
    monkeypatch.setattr(manager_mod.asyncio, "sleep", fake_sleep)


def _set_timeouts(monkeypatch, *, stall_s: float, warmup_s: float):
    from app.config import get_settings

    monkeypatch.setenv("MQB_MCP_WARMUP_STALL_TIMEOUT_S", str(stall_s))
    monkeypatch.setenv("MQB_MCP_WARMUP_TIMEOUT_S", str(warmup_s))
    get_settings.cache_clear()


async def test_ensure_ready_errors_as_stalled_when_truly_stuck(monkeypatch):
    _set_timeouts(monkeypatch, stall_s=5, warmup_s=3600)
    _fake_clock(monkeypatch)

    stuck = {
        "sync": {"inProgress": True, "currentStageName": "Loading schemas", "progress": {"percentComplete": 10.0}},
        "database": {"counts": {"object_structures": 488}},
    }
    manager = TenantMcpManager()
    monkeypatch.setattr(manager, "_build_client", lambda tid, cfg, *, force_reconcile=False: _ScriptedLoader([stuck]))

    status = await manager.ensure_ready("t1", TenantConfig(url="http://x", api_key="k"))
    assert status.state == ERROR
    assert "stuck" in status.message.lower()


async def test_ensure_ready_keeps_waiting_while_genuinely_progressing(monkeypatch):
    """A sync that keeps reporting real, changing progress must not be
    killed early just because it's slow — only a genuine stall should end
    it before the outer absolute timeout."""
    _set_timeouts(monkeypatch, stall_s=5, warmup_s=3600)
    _fake_clock(monkeypatch)

    snapshots = [
        {
            "sync": {
                "inProgress": True,
                "currentStageName": "Loading schemas",
                "progress": {"percentComplete": pct},
            },
            "database": {"counts": {"object_structures": 488}},
        }
        for pct in (10.0, 20.0, 30.0, 40.0)
    ] + [
        {
            "sync": {"inProgress": False, "currentStageName": None, "progress": None},
            "database": {"counts": {"object_structures": 488}},
        }
    ]
    manager = TenantMcpManager()
    monkeypatch.setattr(
        manager, "_build_client", lambda tid, cfg, *, force_reconcile=False: _ScriptedLoader(snapshots)
    )

    status = await manager.ensure_ready("t1", TenantConfig(url="http://x", api_key="k"))
    assert status.state == READY
    assert status.object_structures == 488


async def test_ensure_ready_hits_outer_ceiling_if_never_finishing(monkeypatch):
    """Progress keeps changing (so the stall guard never trips) but the sync
    never actually reports done — the absolute outer timeout still applies."""
    _set_timeouts(monkeypatch, stall_s=3600, warmup_s=5)
    _fake_clock(monkeypatch)

    def _snapshot(i: int) -> dict:
        return {
            "sync": {
                "inProgress": True,
                "currentStageName": "Loading schemas",
                "progress": {"percentComplete": float(i)},
            },
            "database": {"counts": {"object_structures": 488}},
        }

    class _EndlessProgress(_ScriptedLoader):
        def __init__(self):
            super().__init__([])

        async def server_status(self):
            self._i += 1
            return _snapshot(self._i)

    manager = TenantMcpManager()
    monkeypatch.setattr(manager, "_build_client", lambda tid, cfg, *, force_reconcile=False: _EndlessProgress())

    status = await manager.ensure_ready("t1", TenantConfig(url="http://x", api_key="k"))
    assert status.state == ERROR
    assert "outer limit" in status.message.lower()
