"""MCP client errors.

Hard-fail on any MCP/tool error and surface the payload unchanged (no
fabricated facts) — an API layer echoes `detail` into the error envelope as-is.
Adapted verbatim from `maximo-playbook-platform/src/playbook/core/mcp/errors.py`.
"""
from __future__ import annotations

from typing import Any


class MCPError(Exception):
    """Base error for the MCP client (connect / transport / lifecycle)."""


class MCPConnectionError(MCPError):
    """Failed to spawn or initialize the MCP server session."""


class MCPToolError(MCPError):
    """A tool call returned an error result.

    `detail` is the unchanged tool/MCP payload; never rewrite it into a
    human-invented business fact.
    """

    def __init__(self, tool_name: str, detail: Any):
        self.tool_name = tool_name
        self.detail = detail
        super().__init__(f"MCP tool '{tool_name}' failed: {detail!r}")
