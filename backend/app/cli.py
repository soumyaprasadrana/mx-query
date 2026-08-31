"""Standalone tenant management, outside the HTTP request lifecycle.

`add-tenant` and `resync` run a metadata sync to completion in the
foreground, printing progress as it happens — no HTTP timeout, no browser
tab that has to stay open. Point it at the same data volume as a running
mxQuery container (`-v mxquery-data:/data`) and it writes into the exact
same tenant registry and per-tenant data dir; the running server picks up
the result next time it checks that tenant's status.

    docker run --rm -v mxquery-data:/data soumyaprasadrana/mx-query:latest \
        python -m app.cli add-tenant --name "Prod" --url https://host/maximo --api-key ...

Deliberately reuses app.mcp.manager.TenantMcpManager (the same ensure_ready
loop the HTTP path uses) rather than a separate sync implementation —
polling manager.get_status() from here to print progress, instead of the
frontend polling GET /tenants/{id}/status over HTTP, is the only
difference.
"""
from __future__ import annotations

import argparse
import asyncio
import sys

from app import crypto, db
from app.mcp.manager import READY, TenantConfig, TenantMcpManager, TenantStatus


def _format_progress(status: TenantStatus) -> str:
    bits = [f"[{status.state}]"]
    if status.stage:
        bits.append(status.stage)
    if status.percentage is not None:
        bits.append(f"{status.percentage:.0f}%")
    if status.object_structures is not None:
        bits.append(f"{status.object_structures} object structures")
    if status.elapsed_ms is not None:
        bits.append(f"{status.elapsed_ms / 1000:.0f}s elapsed")
    if status.message:
        bits.append(f"- {status.message}")
    return " ".join(bits)


async def _sync_and_report(
    manager: TenantMcpManager, tenant_id: str, cfg: TenantConfig, *, force_reconcile: bool
) -> TenantStatus:
    """Run ensure_ready to completion, printing a line to stdout every time
    the status actually changes (not every poll tick — the sync's own
    stall/timeout guards, unchanged from the HTTP path, already cap how long
    this can run)."""
    task = asyncio.create_task(manager.ensure_ready(tenant_id, cfg, force_reconcile=force_reconcile))
    last_line = ""
    while not task.done():
        line = _format_progress(manager.get_status(tenant_id))
        if line != last_line:
            print(line, flush=True)
            last_line = line
        # 0.5s: this is an in-process dict read, not an HTTP round trip, so
        # frequent polling is free — the sync itself is still the same
        # ensure_ready loop with its own 3s server_status probe interval.
        await asyncio.sleep(0.5)
    status = await task
    final_line = _format_progress(status)
    if final_line != last_line:
        print(final_line, flush=True)
    return status


async def _cmd_add_tenant(args: argparse.Namespace) -> int:
    db.init_db()
    tenant = db.create_tenant(
        args.name,
        args.url,
        crypto.encrypt_secret(args.api_key),
        dev_mode=not args.no_dev_mode,
        readonly=not args.no_readonly,
        copilot_mode=args.copilot_mode,
        embeddings_mode=args.embeddings_mode,
    )
    print(f"Created tenant {tenant.id} ({tenant.name})")

    manager = TenantMcpManager()
    cfg = TenantConfig(
        url=tenant.url,
        api_key=args.api_key,
        dev_mode=tenant.dev_mode,
        readonly=tenant.readonly,
        copilot_mode=tenant.copilot_mode,
        embeddings_mode=tenant.embeddings_mode,
    )
    status = await _sync_and_report(manager, tenant.id, cfg, force_reconcile=False)
    if status.state != READY:
        print(f"Tenant {tenant.id} did not become ready: {status.message}", file=sys.stderr)
        return 1
    print(f"Tenant {tenant.id} is ready.")
    return 0


async def _cmd_resync(args: argparse.Namespace) -> int:
    db.init_db()
    tenant = db.get_tenant(args.tenant_id)
    if tenant is None:
        print(f"No tenant '{args.tenant_id}'", file=sys.stderr)
        return 1

    manager = TenantMcpManager()
    cfg = TenantConfig(
        url=tenant.url,
        api_key=crypto.decrypt_secret(tenant.api_key_encrypted),
        dev_mode=tenant.dev_mode,
        readonly=tenant.readonly,
        copilot_mode=tenant.copilot_mode,
        embeddings_mode=tenant.embeddings_mode,
    )
    status = await _sync_and_report(manager, tenant.id, cfg, force_reconcile=True)
    if status.state != READY:
        print(f"Tenant {tenant.id} did not become ready: {status.message}", file=sys.stderr)
        return 1
    print(f"Tenant {tenant.id} is ready.")
    return 0


def _cmd_list_tenants(_args: argparse.Namespace) -> int:
    db.init_db()
    tenants = db.list_tenants()
    if not tenants:
        print("No tenants.")
        return 0
    for t in tenants:
        print(f"{t.id}  {t.name}  {t.url}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add-tenant", help="Register a tenant and sync its metadata to completion")
    add.add_argument("--name", required=True)
    add.add_argument("--url", required=True, help="Maximo base URL, e.g. https://host/maximo")
    add.add_argument("--api-key", required=True)
    add.add_argument("--no-readonly", action="store_true", help="Register write tools too (default: read-only)")
    add.add_argument("--no-dev-mode", action="store_true", help="Disable dev-mode diagnostic tools")
    add.add_argument("--copilot-mode", action="store_true")
    add.add_argument("--embeddings-mode", default="local", choices=["none", "local", "openai"])
    add.set_defaults(func=_cmd_add_tenant)

    resync = sub.add_parser("resync", help="Force a full metadata re-sync of an existing tenant")
    resync.add_argument("tenant_id")
    resync.set_defaults(func=_cmd_resync)

    listing = sub.add_parser("list-tenants", help="List registered tenants")
    listing.set_defaults(func=_cmd_list_tenants)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    result = args.func(args)
    return asyncio.run(result) if asyncio.iscoroutine(result) else result


if __name__ == "__main__":
    sys.exit(main())
