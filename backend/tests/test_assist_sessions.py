"""No real provider is called here — a fake `litellm.acompletion` stands in,
so this suite never needs a real OpenAI/Anthropic key in CI. Assert on the
CONTRACT (session memory, compaction, expiry), not on what a real model says.
"""
from __future__ import annotations

import pytest


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]


@pytest.fixture()
def fake_litellm(monkeypatch, app):
    calls: list[list[dict]] = []

    class FakeCfg:
        provider = "fake"
        model = "fake/model"
        api_key = ""
        api_base = ""
        api_version = ""
        source = "env"

    import app.llm.client as client_mod

    monkeypatch.setattr(client_mod, "resolve_config", lambda: FakeCfg())

    async def fake_acompletion(messages, **kwargs):
        calls.append(messages)
        return _FakeResponse('{"fields": ["assetnum"]}')

    monkeypatch.setattr(client_mod.litellm, "acompletion", fake_acompletion)
    return calls


def test_stateless_chat_unaffected_by_sessions(client, fake_litellm):
    res = client.post(
        "/api/assist/chat",
        json={"step": "fields", "messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}]},
    )
    assert res.status_code == 200
    assert res.json()["content"] == '{"fields": ["assetnum"]}'


def test_session_create_chat_delete(client, fake_litellm):
    sid = client.post("/api/assist/session").json()["sessionId"]

    res = client.post(
        f"/api/assist/session/{sid}/chat",
        json={"step": "fields", "messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}]},
    )
    assert res.status_code == 200

    assert client.delete(f"/api/assist/session/{sid}").status_code == 204

    after_delete = client.post(
        f"/api/assist/session/{sid}/chat",
        json={"step": "fields", "messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}]},
    )
    assert after_delete.status_code == 404
    assert after_delete.json()["error"]["code"] == "assist_session_not_found"


def test_session_replays_prior_turns_not_prior_system_messages(client, fake_litellm):
    sid = client.post("/api/assist/session").json()["sessionId"]

    client.post(
        f"/api/assist/session/{sid}/chat",
        json={
            "step": "os",
            "messages": [{"role": "system", "content": "SYS-OS"}, {"role": "user", "content": "pick an OS"}],
            "memory": "[os] note: pick an OS",
        },
    )
    client.post(
        f"/api/assist/session/{sid}/chat",
        json={
            "step": "fields",
            "messages": [{"role": "system", "content": "SYS-FIELDS"}, {"role": "user", "content": "pick fields"}],
            "memory": "[fields] note: pick fields",
        },
    )

    second_call_messages = fake_litellm[-1]
    # Only the current step's system message survives - never a prior step's.
    system_messages = [m for m in second_call_messages if m["role"] == "system"]
    assert system_messages == [{"role": "system", "content": "SYS-FIELDS"}]
    # The prior turn's memory line (not its real catalog-laden prompt) is replayed.
    assert any(m["content"] == "[os] note: pick an OS" for m in second_call_messages)


def test_session_memory_does_not_grow_with_catalog_size(client, fake_litellm):
    """The real bug this guards: a large per-step catalog must not compound
    across turns just because sessions are in use."""
    sid = client.post("/api/assist/session").json()["sessionId"]
    big_catalog = "x" * 3000

    for i in range(5):
        client.post(
            f"/api/assist/session/{sid}/chat",
            json={
                "step": "fields",
                "messages": [
                    {"role": "system", "content": "SYS"},
                    {"role": "user", "content": f"turn {i} catalog: {big_catalog}"},
                ],
                "memory": f"[fields] note: turn {i}",
            },
        )

    sizes = [sum(len(m["content"]) for m in call) for call in fake_litellm]
    # Each turn's OWN catalog is paid once (~3000+ chars); what carries FORWARD
    # into later turns must be small and roughly flat, not compounding.
    growth_per_turn = [sizes[i] - sizes[i - 1] for i in range(1, len(sizes))]
    assert all(g < 200 for g in growth_per_turn), growth_per_turn


def test_session_chat_404_for_unknown_session(client, fake_litellm):
    res = client.post(
        "/api/assist/session/does-not-exist/chat",
        json={"step": "fields", "messages": [{"role": "user", "content": "u"}]},
    )
    assert res.status_code == 404


def test_idle_sweep_reaps_only_stale_sessions():
    import time

    from app.llm import sessions

    sessions._sessions.clear()
    stale = sessions.create_session()
    sessions._sessions[stale].last_active = time.monotonic() - 700
    fresh = sessions.create_session()

    reaped = sessions.sweep_idle(600.0)

    assert reaped == 1
    assert not sessions.exists(stale)
    assert sessions.exists(fresh)
