"""Tenant registry — plain sqlite3, no ORM/migrations.

A handful of rows (one per configured Maximo instance), so
`maximo-playbook-platform`'s full SQLAlchemy+Alembic stack would be
over-engineering here; a single table with hand-written repository functions
is enough and keeps Phase 1 small.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    dev_mode INTEGER NOT NULL DEFAULT 1,
    readonly INTEGER NOT NULL DEFAULT 1,
    copilot_mode INTEGER NOT NULL DEFAULT 0,
    embeddings_mode TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL
);

-- Single-row app-wide LLM config (id is always 1). Admin-set override of
-- the env-var defaults in Settings.llm_*, see docs/DECISIONS.md MQB-006.
-- No admin-set row => the app falls back to env defaults (or stays
-- unconfigured if those are blank too).
CREATE TABLE IF NOT EXISTS llm_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL DEFAULT '',
    api_base TEXT NOT NULL DEFAULT '',
    api_version TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

-- Single-row app-wide theme pack override (id is always 1), same shape as
-- llm_config above. See docs/DECISIONS.md MQB-008 — app chrome, not tenant-
-- or Maximo-scoped, so one instance-wide row is enough. `pack_json` is the
-- frontend's ThemePack object verbatim (frontend/src/lib/theme/schema.ts) —
-- this backend never interprets individual tokens, just stores/returns the
-- blob after a light shape check (routes/theme.py).
CREATE TABLE IF NOT EXISTS theme_pack (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pack_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Saved query library (docs/DECISIONS.md MQB-010) — per-tenant, since OS
-- names/schemas differ per Maximo instance. `folder_id`/`parent_id` are
-- ON DELETE SET NULL, not CASCADE: deleting a folder unfiles its contents
-- (moves them to "Stash" — folder_id IS NULL — rather than destroying them).
-- `folder_id IS NULL` IS "Stash", not a separate row — always exists, never
-- delete-able, no provisioning needed. Deleting a tenant cascades (no point
-- keeping orphaned per-tenant queries).
CREATE TABLE IF NOT EXISTS saved_query_folders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES saved_query_folders(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

-- `payload_json` is the same shape the frontend's existing Export already
-- produces (os_query_builder args) — stored opaquely, same "don't interpret"
-- discipline as theme_pack, so loading a saved query back into the wizard/
-- builder can reuse the existing Import codepath verbatim. `os_name` is
-- denormalized out of the payload at save time for fast filtering.
CREATE TABLE IF NOT EXISTS saved_queries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    folder_id TEXT REFERENCES saved_query_folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    os_name TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_queries_tenant ON saved_queries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_folder ON saved_queries(folder_id);

-- Tags as a junction table, not a CSV column — clean search/autocomplete,
-- no string-splitting. Composite PK also dedupes a tag applied twice.
CREATE TABLE IF NOT EXISTS saved_query_tags (
    saved_query_id TEXT NOT NULL REFERENCES saved_queries(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (saved_query_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_saved_query_tags_tag ON saved_query_tags(tag);
"""


@dataclass
class Tenant:
    id: str
    name: str
    url: str
    api_key_encrypted: str
    dev_mode: bool
    readonly: bool
    copilot_mode: bool
    embeddings_mode: str
    created_at: str

    def public(self) -> dict:
        """Tenant fields safe to return over the API — never the encrypted key."""
        return {
            "id": self.id,
            "name": self.name,
            "url": self.url,
            "devMode": self.dev_mode,
            "readonly": self.readonly,
            "copilotMode": self.copilot_mode,
            "embeddingsMode": self.embeddings_mode,
            "createdAt": self.created_at,
        }


def _connect() -> sqlite3.Connection:
    path = Path(get_settings().tenant_db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # `timeout` (seconds sqlite retries before raising "database is locked")
    # and WAL journal mode both matter once app/cli.py exists: a CLI
    # invocation and the running server can now open this same file from two
    # separate OS processes at once. WAL lets readers proceed without
    # blocking on a writer; the raised timeout absorbs the brief window where
    # both processes want to write at the same instant. A no-op to set on
    # every connect once the file is already in WAL mode.
    conn = sqlite3.connect(path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    # sqlite ignores FK constraints unless enabled per-connection — needed for
    # saved_queries'/saved_query_folders' ON DELETE CASCADE/SET NULL to
    # actually fire (see MQB-010; no other table declares FKs).
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(_SCHEMA)


def _row_to_tenant(row: sqlite3.Row) -> Tenant:
    return Tenant(
        id=row["id"],
        name=row["name"],
        url=row["url"],
        api_key_encrypted=row["api_key_encrypted"],
        dev_mode=bool(row["dev_mode"]),
        readonly=bool(row["readonly"]),
        copilot_mode=bool(row["copilot_mode"]),
        embeddings_mode=row["embeddings_mode"],
        created_at=row["created_at"],
    )


def create_tenant(
    name: str,
    url: str,
    api_key_encrypted: str,
    *,
    dev_mode: bool = True,
    readonly: bool = True,
    copilot_mode: bool = False,
    embeddings_mode: str = "local",
) -> Tenant:
    tenant = Tenant(
        id=uuid.uuid4().hex,
        name=name,
        url=url,
        api_key_encrypted=api_key_encrypted,
        dev_mode=dev_mode,
        readonly=readonly,
        copilot_mode=copilot_mode,
        embeddings_mode=embeddings_mode,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    with _connect() as conn:
        conn.execute(
            "INSERT INTO tenants (id, name, url, api_key_encrypted, dev_mode, readonly, "
            "copilot_mode, embeddings_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                tenant.id,
                tenant.name,
                tenant.url,
                tenant.api_key_encrypted,
                int(tenant.dev_mode),
                int(tenant.readonly),
                int(tenant.copilot_mode),
                tenant.embeddings_mode,
                tenant.created_at,
            ),
        )
    return tenant


def list_tenants() -> list[Tenant]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM tenants ORDER BY created_at").fetchall()
    return [_row_to_tenant(r) for r in rows]


def get_tenant(tenant_id: str) -> Tenant | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
    return _row_to_tenant(row) if row else None


def delete_tenant(tenant_id: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM tenants WHERE id = ?", (tenant_id,))
    return cur.rowcount > 0


@dataclass
class LLMConfig:
    provider: str
    model: str
    api_key_encrypted: str
    api_base: str
    api_version: str
    updated_at: str


def _row_to_llm_config(row: sqlite3.Row) -> LLMConfig:
    return LLMConfig(
        provider=row["provider"],
        model=row["model"],
        api_key_encrypted=row["api_key_encrypted"],
        api_base=row["api_base"],
        api_version=row["api_version"],
        updated_at=row["updated_at"],
    )


def get_llm_config() -> LLMConfig | None:
    """The admin-set override row, or None if the admin has never saved one
    (in which case callers fall back to Settings.llm_* env defaults)."""
    with _connect() as conn:
        row = conn.execute("SELECT * FROM llm_config WHERE id = 1").fetchone()
    return _row_to_llm_config(row) if row else None


def set_llm_config(
    provider: str, model: str, api_key_encrypted: str, api_base: str, api_version: str
) -> LLMConfig:
    """Upsert the single admin-config row. An empty `api_key_encrypted` keeps
    the previously stored key (so re-saving provider/model alone doesn't
    force re-entering the key) — callers pass the existing encrypted blob
    through when the admin left the key field blank in the form."""
    config = LLMConfig(
        provider=provider,
        model=model,
        api_key_encrypted=api_key_encrypted,
        api_base=api_base,
        api_version=api_version,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    with _connect() as conn:
        conn.execute(
            "INSERT INTO llm_config (id, provider, model, api_key_encrypted, api_base, api_version, updated_at) "
            "VALUES (1, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, model=excluded.model, "
            "api_key_encrypted=excluded.api_key_encrypted, api_base=excluded.api_base, "
            "api_version=excluded.api_version, updated_at=excluded.updated_at",
            (config.provider, config.model, config.api_key_encrypted, config.api_base,
             config.api_version, config.updated_at),
        )
    return config


def delete_llm_config() -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM llm_config WHERE id = 1")
    return cur.rowcount > 0


def get_theme_pack() -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT pack_json FROM theme_pack WHERE id = 1").fetchone()
    return json.loads(row["pack_json"]) if row else None


def set_theme_pack(pack: dict) -> None:
    """`pack` is the already-validated ThemePack dict (routes/theme.py) —
    stored verbatim as JSON, never picked apart into columns (MQB-008: the
    token set is expected to grow, a fixed schema here would fight that)."""
    with _connect() as conn:
        conn.execute(
            "INSERT INTO theme_pack (id, pack_json, updated_at) VALUES (1, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET pack_json=excluded.pack_json, updated_at=excluded.updated_at",
            (json.dumps(pack), datetime.now(timezone.utc).isoformat()),
        )


def delete_theme_pack() -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM theme_pack WHERE id = 1")
    return cur.rowcount > 0


@dataclass
class SavedQueryFolder:
    id: str
    tenant_id: str
    name: str
    parent_id: str | None
    created_at: str

    def public(self) -> dict:
        return {"id": self.id, "name": self.name, "parentId": self.parent_id, "createdAt": self.created_at}


def _row_to_folder(row: sqlite3.Row) -> SavedQueryFolder:
    return SavedQueryFolder(
        id=row["id"], tenant_id=row["tenant_id"], name=row["name"],
        parent_id=row["parent_id"], created_at=row["created_at"],
    )


def create_saved_query_folder(tenant_id: str, name: str, parent_id: str | None = None) -> SavedQueryFolder:
    folder = SavedQueryFolder(
        id=uuid.uuid4().hex, tenant_id=tenant_id, name=name, parent_id=parent_id,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    with _connect() as conn:
        conn.execute(
            "INSERT INTO saved_query_folders (id, tenant_id, name, parent_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (folder.id, folder.tenant_id, folder.name, folder.parent_id, folder.created_at),
        )
    return folder


def list_saved_query_folders(tenant_id: str) -> list[SavedQueryFolder]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM saved_query_folders WHERE tenant_id = ? ORDER BY name", (tenant_id,)
        ).fetchall()
    return [_row_to_folder(r) for r in rows]


def get_saved_query_folder(tenant_id: str, folder_id: str) -> SavedQueryFolder | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM saved_query_folders WHERE tenant_id = ? AND id = ?", (tenant_id, folder_id)
        ).fetchone()
    return _row_to_folder(row) if row else None


def update_saved_query_folder(
    tenant_id: str, folder_id: str, *, name: str | None = None, parent_id: str | None | object = ...
) -> SavedQueryFolder | None:
    """`parent_id=...` (the default) means "leave unchanged"; pass `None`
    explicitly to move the folder to top-level."""
    existing = get_saved_query_folder(tenant_id, folder_id)
    if existing is None:
        return None
    new_name = name if name is not None else existing.name
    new_parent = existing.parent_id if parent_id is ... else parent_id
    with _connect() as conn:
        conn.execute(
            "UPDATE saved_query_folders SET name = ?, parent_id = ? WHERE tenant_id = ? AND id = ?",
            (new_name, new_parent, tenant_id, folder_id),
        )
    return get_saved_query_folder(tenant_id, folder_id)


def delete_saved_query_folder(tenant_id: str, folder_id: str) -> bool:
    """Contents (queries and any subfolders) are unfiled/promoted to
    top-level via the schema's ON DELETE SET NULL — never destroyed."""
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM saved_query_folders WHERE tenant_id = ? AND id = ?", (tenant_id, folder_id)
        )
    return cur.rowcount > 0


@dataclass
class SavedQuery:
    id: str
    tenant_id: str
    folder_id: str | None
    name: str
    description: str
    os_name: str
    payload_json: str
    tags: list[str]
    created_at: str
    updated_at: str

    def public(self, *, include_payload: bool) -> dict:
        d: dict = {
            "id": self.id,
            "folderId": self.folder_id,
            "name": self.name,
            "description": self.description,
            "osName": self.os_name,
            "tags": self.tags,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }
        if include_payload:
            d["payload"] = json.loads(self.payload_json)
        return d


def _tags_for(conn: sqlite3.Connection, query_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT tag FROM saved_query_tags WHERE saved_query_id = ? ORDER BY tag", (query_id,)
    ).fetchall()
    return [r["tag"] for r in rows]


def _row_to_saved_query(conn: sqlite3.Connection, row: sqlite3.Row) -> SavedQuery:
    return SavedQuery(
        id=row["id"], tenant_id=row["tenant_id"], folder_id=row["folder_id"],
        name=row["name"], description=row["description"], os_name=row["os_name"],
        payload_json=row["payload_json"], tags=_tags_for(conn, row["id"]),
        created_at=row["created_at"], updated_at=row["updated_at"],
    )


def create_saved_query(
    tenant_id: str, *, folder_id: str | None, name: str, description: str,
    os_name: str, payload: dict, tags: list[str],
) -> SavedQuery:
    now = datetime.now(timezone.utc).isoformat()
    query_id = uuid.uuid4().hex
    payload_json = json.dumps(payload)
    with _connect() as conn:
        conn.execute(
            "INSERT INTO saved_queries (id, tenant_id, folder_id, name, description, os_name, "
            "payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (query_id, tenant_id, folder_id, name, description, os_name, payload_json, now, now),
        )
        for tag in dict.fromkeys(t.strip() for t in tags if t.strip()):  # de-dupe, keep order
            conn.execute(
                "INSERT OR IGNORE INTO saved_query_tags (saved_query_id, tag) VALUES (?, ?)",
                (query_id, tag),
            )
        row = conn.execute("SELECT * FROM saved_queries WHERE id = ?", (query_id,)).fetchone()
        return _row_to_saved_query(conn, row)


# Sentinel distinguishing "no folder filter" (show every folder) from an
# explicit `folder_id=None` (Stash only) in `list_saved_queries`.
ANY_FOLDER = object()


def list_saved_queries(
    tenant_id: str, *, q: str | None = None, tag: str | None = None,
    os_name: str | None = None, folder_id: str | None | object = ANY_FOLDER,
) -> list[SavedQuery]:
    clauses = ["sq.tenant_id = ?"]
    params: list = [tenant_id]
    if q:
        clauses.append("(sq.name LIKE ? OR sq.description LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])
    if os_name:
        clauses.append("sq.os_name = ?")
        params.append(os_name)
    if folder_id is not ANY_FOLDER:
        if folder_id is None:
            clauses.append("sq.folder_id IS NULL")
        else:
            clauses.append("sq.folder_id = ?")
            params.append(folder_id)
    join = ""
    if tag:
        join = "JOIN saved_query_tags sqt ON sqt.saved_query_id = sq.id"
        clauses.append("sqt.tag = ?")
        params.append(tag)
    sql = f"SELECT sq.* FROM saved_queries sq {join} WHERE {' AND '.join(clauses)} ORDER BY sq.updated_at DESC"
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
        return [_row_to_saved_query(conn, r) for r in rows]


def get_saved_query(tenant_id: str, query_id: str) -> SavedQuery | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM saved_queries WHERE tenant_id = ? AND id = ?", (tenant_id, query_id)
        ).fetchone()
        return _row_to_saved_query(conn, row) if row else None


def update_saved_query(
    tenant_id: str, query_id: str, *, name: str | None = None, description: str | None = None,
    folder_id: str | None | object = ANY_FOLDER, os_name: str | None = None,
    payload: dict | None = None, tags: list[str] | None = None,
) -> SavedQuery | None:
    """Any field left at its default is unchanged. `folder_id=None` moves the
    query to Stash; omit `folder_id` entirely to leave it where it is.
    `os_name` is a caller-supplied denormalized field, same as `create_saved_query`
    — never sniffed out of `payload`'s internal shape, which this backend
    doesn't interpret (see MQB-010)."""
    existing = get_saved_query(tenant_id, query_id)
    if existing is None:
        return None
    new_name = name if name is not None else existing.name
    new_description = description if description is not None else existing.description
    new_folder = existing.folder_id if folder_id is ANY_FOLDER else folder_id
    new_os_name = os_name if os_name is not None else existing.os_name
    new_payload_json = json.dumps(payload) if payload is not None else existing.payload_json
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            "UPDATE saved_queries SET name = ?, description = ?, folder_id = ?, os_name = ?, "
            "payload_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
            (new_name, new_description, new_folder, new_os_name, new_payload_json, now, tenant_id, query_id),
        )
        if tags is not None:
            conn.execute("DELETE FROM saved_query_tags WHERE saved_query_id = ?", (query_id,))
            for t in dict.fromkeys(t.strip() for t in tags if t.strip()):
                conn.execute(
                    "INSERT OR IGNORE INTO saved_query_tags (saved_query_id, tag) VALUES (?, ?)",
                    (query_id, t),
                )
    return get_saved_query(tenant_id, query_id)


def delete_saved_query(tenant_id: str, query_id: str) -> bool:
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM saved_queries WHERE tenant_id = ? AND id = ?", (tenant_id, query_id)
        )
    return cur.rowcount > 0


def delete_saved_queries_bulk(tenant_id: str, *, folder_id: str | None | object) -> int:
    """Bulk "clear" for the library UI. `folder_id=ANY_FOLDER` wipes every
    saved query for the tenant (the explicit "delete everything" mode);
    `None` restricts to Stash; a string restricts to that one folder's
    queries (the folder itself is untouched). Returns the count deleted."""
    with _connect() as conn:
        if folder_id is ANY_FOLDER:
            cur = conn.execute("DELETE FROM saved_queries WHERE tenant_id = ?", (tenant_id,))
        elif folder_id is None:
            cur = conn.execute(
                "DELETE FROM saved_queries WHERE tenant_id = ? AND folder_id IS NULL", (tenant_id,)
            )
        else:
            cur = conn.execute(
                "DELETE FROM saved_queries WHERE tenant_id = ? AND folder_id = ?", (tenant_id, folder_id)
            )
    return cur.rowcount


def list_saved_query_tags(tenant_id: str) -> list[str]:
    """Distinct tags in use for this tenant, for filter-chip/autocomplete UI."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT DISTINCT sqt.tag FROM saved_query_tags sqt "
            "JOIN saved_queries sq ON sq.id = sqt.saved_query_id "
            "WHERE sq.tenant_id = ? ORDER BY sqt.tag",
            (tenant_id,),
        ).fetchall()
    return [r["tag"] for r in rows]
