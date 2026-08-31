/** GET /api/version — product name, semver, pinned MCP npm spec. */

export type McpServerInfo = {
  package: string;
  version: string;
};

export type AppVersionInfo = {
  name: string;
  version: string;
  mcpServer: McpServerInfo | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseAppVersion(raw: unknown): AppVersionInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const name = str(rec.name);
  const version = str(rec.version);
  if (!name || !version) return null;
  let mcpServer: McpServerInfo | null = null;
  const mcp = rec.mcpServer;
  if (mcp && typeof mcp === "object") {
    const m = mcp as Record<string, unknown>;
    const pkg = str(m.package);
    const ver = str(m.version);
    if (pkg || ver) mcpServer = { package: pkg, version: ver };
  }
  return { name, version, mcpServer };
}

export function mcpSpecLabel(mcp: McpServerInfo | null): string {
  if (!mcp?.version) return "";
  return mcp.package ? `${mcp.package}@${mcp.version}` : `mcp v${mcp.version}`;
}
