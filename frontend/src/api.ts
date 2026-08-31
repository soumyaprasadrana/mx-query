// Thin HTTP client for the backend's tenant lifecycle + generic tool-call
// proxy endpoints (docs/ARCHITECTURE.md, docs/DECISIONS.md MQB-001). No OSLC
// logic lives here - every tool call just forwards args and returns the raw
// tool payload unchanged.
import { ThemePack } from "./lib/theme";
import {
  AdminSession,
  ApiError,
  ApiErrorEnvelope,
  LLMConfigSave,
  LLMConfigStatus,
  LLMTestResult,
  Tenant,
  TenantStatus,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
    const env = body as Partial<ApiErrorEnvelope>;
    if (env?.error) throw new ApiError(env.error);
    throw new Error(`HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface CreateTenantInput {
  name: string;
  url: string;
  apiKey: string;
  devMode: boolean;
  readonly: boolean;
  copilotMode: boolean;
  embeddingsMode: "none" | "local" | "openai";
}

export const createTenant = (input: CreateTenantInput) =>
  request<Tenant>("/tenants", { method: "POST", body: JSON.stringify(input) });

export const listTenants = () => request<Tenant[]>("/tenants");

export const getTenant = (id: string) => request<Tenant>(`/tenants/${id}`);

export const deleteTenant = (id: string) =>
  request<void>(`/tenants/${id}`, { method: "DELETE" });

export const getTenantStatus = (id: string) =>
  request<TenantStatus>(`/tenants/${id}/status`);

// Proactively (re)connect the tenant's warm MCP client - call this when
// entering the builder so a cold spawn happens up front, with a visible
// "reconnecting" state, instead of silently inside the first tool call.
export const wakeTenant = (id: string) =>
  request<{ mcp_connected: boolean }>(`/tenants/${id}/wake`, { method: "POST" });

export const resyncTenant = (id: string) =>
  request<TenantStatus>(`/tenants/${id}/resync`, { method: "POST", body: "{}" });

// The one generic tool-call proxy - args go straight through as the request
// body, unmodified, and the tool's response comes back unmodified.
export const callTool = <T = unknown>(tenantId: string, tool: string, args: Record<string, unknown>) =>
  request<T>(`/tenants/${tenantId}/tools/${tool}`, { method: "POST", body: JSON.stringify(args) });

/** Public. Product semver plus the pinned maximo-mcp-server npm spec. */
export const getAppVersion = () => request<unknown>("/version");

export const getLLMConfig = () => request<LLMConfigStatus>("/llm/config");

export const putLLMConfig = (body: LLMConfigSave) =>
  request<LLMConfigStatus>("/llm/config", { method: "PUT", body: JSON.stringify(body) });

export const deleteLLMConfig = () =>
  request<void>("/llm/config", { method: "DELETE" });

export const testLLMConfig = () =>
  request<LLMTestResult>("/llm/config/test", { method: "POST", body: "{}" });

export const getAdminSession = () => request<AdminSession>("/admin/session");

export const adminLogin = (password: string) =>
  request<{ authenticated: boolean }>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

export const adminLogout = () =>
  request<{ authenticated: boolean }>("/admin/logout", { method: "POST", body: "{}" });

export interface ThemeResponse {
  pack: ThemePack | null;
  source: "db" | null;
}

async function themeRequest<T>(path: string, init?: RequestInit): Promise<T | "missing"> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 404) return "missing";
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
    const env = body as Partial<ApiErrorEnvelope>;
    if (env?.error) throw new ApiError(env.error);
    throw new Error(`HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Public. Returns null when the backend theme table is not wired yet (404). */
export async function getTheme(): Promise<ThemeResponse | null> {
  const result = await themeRequest<ThemeResponse>("/theme");
  return result === "missing" ? null : result;
}

/** Admin session. `local-only` when the API is not wired yet. */
export async function putTheme(pack: ThemePack): Promise<"saved" | "local-only"> {
  const result = await themeRequest<ThemeResponse>("/theme", {
    method: "PUT",
    body: JSON.stringify(pack),
  });
  return result === "missing" ? "local-only" : "saved";
}

export const deleteTheme = async (): Promise<"cleared" | "local-only"> => {
  const result = await themeRequest<void>("/theme", { method: "DELETE" });
  return result === "missing" ? "local-only" : "cleared";
};

export type SavedQueryFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

export type SavedQueryListItem = {
  id: string;
  folderId: string | null;
  name: string;
  description: string;
  osName: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type SavedQuery = SavedQueryListItem & { payload: Record<string, unknown> };

export type SavedQueryListFilter = {
  q?: string;
  tag?: string;
  osName?: string;
  /** omit = all folders; `"stash"` = unfiled; folder id = that folder */
  folderId?: string;
};

export const listSavedQueryFolders = (tenantId: string) =>
  request<SavedQueryFolder[]>(`/tenants/${tenantId}/saved-query-folders`);

export const createSavedQueryFolder = (tenantId: string, name: string, parentId?: string | null) =>
  request<SavedQueryFolder>(`/tenants/${tenantId}/saved-query-folders`, {
    method: "POST",
    body: JSON.stringify({ name, ...(parentId ? { parentId } : {}) }),
  });

export const patchSavedQueryFolder = (tenantId: string, id: string, body: { name?: string; parentId?: string | null }) =>
  request<SavedQueryFolder>(`/tenants/${tenantId}/saved-query-folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteSavedQueryFolder = (tenantId: string, id: string) =>
  request<void>(`/tenants/${tenantId}/saved-query-folders/${id}`, { method: "DELETE" });

export function listSavedQueries(tenantId: string, filter: SavedQueryListFilter = {}) {
  const sp = new URLSearchParams();
  if (filter.q?.trim()) sp.set("q", filter.q.trim());
  if (filter.tag?.trim()) sp.set("tag", filter.tag.trim());
  if (filter.osName?.trim()) sp.set("osName", filter.osName.trim());
  if (filter.folderId != null) sp.set("folderId", filter.folderId);
  const q = sp.toString();
  return request<SavedQueryListItem[]>(`/tenants/${tenantId}/saved-queries${q ? `?${q}` : ""}`);
}

export const listSavedQueryTags = (tenantId: string) =>
  request<string[]>(`/tenants/${tenantId}/saved-queries/tags`);

export const getSavedQuery = (tenantId: string, id: string) =>
  request<SavedQuery>(`/tenants/${tenantId}/saved-queries/${id}`);

export const createSavedQuery = (
  tenantId: string,
  body: {
    name: string;
    osName: string;
    payload: Record<string, unknown>;
    description?: string;
    folderId?: string | null;
    tags?: string[];
  },
) =>
  request<SavedQuery>(`/tenants/${tenantId}/saved-queries`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const patchSavedQuery = (
  tenantId: string,
  id: string,
  body: {
    name?: string;
    osName?: string;
    payload?: Record<string, unknown>;
    description?: string;
    folderId?: string | null;
    tags?: string[];
  },
) =>
  request<SavedQuery>(`/tenants/${tenantId}/saved-queries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteSavedQuery = (tenantId: string, id: string) =>
  request<void>(`/tenants/${tenantId}/saved-queries/${id}`, { method: "DELETE" });

/** `folderId` is required: `"stash"`, `"all"`, or a real folder id. */
export const clearSavedQueries = (tenantId: string, folderId: string) =>
  request<{ deleted: number }>(
    `/tenants/${tenantId}/saved-queries?folderId=${encodeURIComponent(folderId)}`,
    { method: "DELETE" },
  );

