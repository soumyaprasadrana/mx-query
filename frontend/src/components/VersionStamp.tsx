/** Product + pinned MCP versions from GET /api/version. */
import { mcpSpecLabel } from "../lib/appVersion";
import { useAppVersion } from "./AppVersionProvider";

export default function VersionStamp() {
  const info = useAppVersion();
  if (!info) return null;
  const mcpTitle = mcpSpecLabel(info.mcpServer);
  return (
    <span className="wiz-ver">
      <span className="wiz-brand-ver" title={`${info.name} ${info.version}`}>
        v{info.version}
      </span>
      {info.mcpServer?.version ? (
        <span className="badge version" title={mcpTitle || undefined}>
          mcp v{info.mcpServer.version}
        </span>
      ) : null}
    </span>
  );
}
