/**
 * Saved-query folders, tags, open-in-builder / report. Lives at /library.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Tenant, ApiError } from "../../types";
import {
  clearSavedQueries,
  createSavedQuery,
  createSavedQueryFolder,
  deleteSavedQuery,
  deleteSavedQueryFolder,
  getSavedQuery,
  listSavedQueries,
  listSavedQueryFolders,
  listSavedQueryTags,
  patchSavedQuery,
  patchSavedQueryFolder,
  SavedQuery,
  SavedQueryFolder,
  SavedQueryListItem,
} from "../../api";
import ThemeToggle from "../ThemeToggle";
import AdminButton from "../settings/AdminButton";
import ResyncButton from "../ResyncButton";
import MenuSelect from "../MenuSelect";
import Brand from "../Brand";
import { childCount, folderPath, isCollapsedAway, walkFolders } from "../../lib/savedFolders";
import {
  Icon,
  faArrowRightArrowLeft,
  faChevronDown,
  faChevronRight,
  faClone,
  faEraser,
  faFolder,
  faFolderPlus,
  faMagnifyingGlass,
  faPen,
  faPlay,
  faSliders,
  faTable,
  faTrashCan,
} from "../Icon";

const ALL = "all";
const STASH = "stash";

export default function QueryLibrary({
  tenant,
  onHome,
  onSwitchTenant,
  onResync,
  onOpen,
}: {
  tenant: Tenant;
  onHome: () => void;
  onSwitchTenant: () => void;
  onResync?: () => void;
  onOpen: (query: SavedQuery, mode: "builder" | "results" | "report") => void;
}) {
  const [folders, setFolders] = useState<SavedQueryFolder[]>([]);
  const [items, setItems] = useState<SavedQueryListItem[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [folderId, setFolderId] = useState(ALL);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [osName, setOsName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [creating, setCreating] = useState<string | "root" | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [edit, setEdit] = useState<SavedQueryListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editFolder, setEditFolder] = useState(STASH);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmFolder, setConfirmFolder] = useState<string | null>(null);
  const [clearStash, setClearStash] = useState(false);
  const [clearAll, setClearAll] = useState(false);
  const [clearFolder, setClearFolder] = useState<string | null>(null);
  const [busyClear, setBusyClear] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [osCatalog, setOsCatalog] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [f, t] = await Promise.all([
        listSavedQueryFolders(tenant.id),
        listSavedQueryTags(tenant.id),
      ]);
      setFolders(f);
      setTags(t);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, [tenant.id]);

  const search = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await listSavedQueries(tenant.id, {
        q: q || undefined,
        tag: tag || undefined,
        osName: osName || undefined,
        folderId: folderId === ALL ? undefined : folderId,
      });
      setItems(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [tenant.id, q, tag, osName, folderId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void search();
  }, [search]);

  useEffect(() => {
    setClearStash(false);
    setClearAll(false);
    setClearFolder(null);
  }, [folderId]);

  const osOptions = useMemo(() => [...new Set(items.map((i) => i.osName).filter(Boolean))].sort(), [items]);
  useEffect(() => {
    setOsCatalog((prev) => {
      const next = new Set(prev);
      for (const o of osOptions) next.add(o);
      return [...next].sort();
    });
  }, [osOptions]);

  const tree = useMemo(() => walkFolders(folders), [folders]);

  async function makeFolder(parentId?: string | null) {
    const name = newFolder.trim();
    if (!name) return;
    try {
      const created = await createSavedQueryFolder(tenant.id, name, parentId);
      setNewFolder("");
      setCreating(null);
      if (parentId) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
      setFolderId(created.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function renameFolder(id: string) {
    const name = renameVal.trim();
    if (!name) return;
    try {
      await patchSavedQueryFolder(tenant.id, id, { name });
      setRenameId(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function removeFolder(id: string) {
    try {
      await deleteSavedQueryFolder(tenant.id, id);
      setConfirmFolder(null);
      if (folderId === id) setFolderId(ALL);
      await reload();
      await search();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function open(id: string, mode: "builder" | "results" | "report") {
    setOpening(id + mode);
    setError(null);
    try {
      const full = await getSavedQuery(tenant.id, id);
      onOpen(full, mode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setOpening(null);
    }
  }

  async function duplicate(id: string) {
    setOpening(id + "dup");
    setError(null);
    try {
      const full = await getSavedQuery(tenant.id, id);
      await createSavedQuery(tenant.id, {
        name: `${full.name} copy`,
        osName: full.osName,
        payload: full.payload,
        description: full.description || undefined,
        folderId: full.folderId,
        tags: full.tags,
      });
      await reload();
      await search();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setOpening(null);
    }
  }

  async function bulkClear(target: string) {
    setBusyClear(true);
    setError(null);
    try {
      await clearSavedQueries(tenant.id, target);
      setClearStash(false);
      setClearAll(false);
      setClearFolder(null);
      await reload();
      await search();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyClear(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    try {
      const tagsList = editTags.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
      await patchSavedQuery(tenant.id, edit.id, {
        name: editName.trim(),
        tags: tagsList,
        folderId: editFolder === STASH ? null : editFolder,
      });
      setEdit(null);
      await reload();
      await search();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function removeQuery(id: string) {
    try {
      await deleteSavedQuery(tenant.id, id);
      setConfirmId(null);
      await search();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  const emptyTenant = !busy && items.length === 0 && folderId === ALL && !q && !tag && !osName;
  const sweepFolder = clearFolder ? folders.find((f) => f.id === clearFolder) : undefined;
  const sweep = clearAll
    ? {
        target: "all",
        title: "Clear all saved queries",
        body: "This permanently deletes every saved query in this tenant, in every folder. Folders themselves stay. This cannot be undone.",
        go: "Delete every saved query",
      }
    : clearStash
      ? {
          target: STASH,
          title: "Empty Stash",
          body: "This permanently deletes every unfiled query in Stash. This cannot be undone.",
          go: "Empty Stash",
        }
      : clearFolder
        ? {
            target: clearFolder,
            title: sweepFolder ? `Empty "${sweepFolder.name}"` : "Empty folder",
            body: "This permanently deletes every query in this folder. The folder itself stays. This cannot be undone.",
            go: "Empty this folder",
          }
        : null;

  return (
    <div className="wiz-root lib-root">
      <header className="wiz-top">
        <div className="wiz-brand">
          <Brand onClick={onHome} />
          <span className="muted"> | {tenant.name}</span>
        </div>
        <div className="wiz-top-actions">
          <AdminButton />
          <ThemeToggle />
          {onResync && <ResyncButton tenantId={tenant.id} onStarted={onResync} />}
          <button type="button" className="ghost" onClick={onSwitchTenant}>
            <Icon icon={faArrowRightArrowLeft} /> Switch
          </button>
        </div>
      </header>
      <div className="lib-body">
        <aside className="lib-rail panel-block">
          <p className="lbl" style={{ marginBottom: 8 }}>Folders</p>
          <button type="button" className={`lib-folder${folderId === ALL ? " on" : ""}`} onClick={() => setFolderId(ALL)}>
            All
          </button>
          <div className={`lib-folder-row${folderId === STASH ? " on" : ""}`}>
            <span className="lib-folder-spacer" />
            <button type="button" className="lib-folder" onClick={() => setFolderId(STASH)}>
              <Icon icon={faFolder} /> Stash
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ gridColumn: "5" }}
              title="Empty Stash - permanently delete unfiled queries"
              onClick={() => setClearStash(true)}
            >
              <Icon icon={faEraser} />
            </button>
          </div>
          {tree.filter((f) => !isCollapsedAway(f, collapsed, folders)).map((f) => (
            <div key={f.id}>
              <div className={`lib-folder-row${folderId === f.id ? " on" : ""}`} style={{ paddingLeft: 4 + f.depth * 12 }}>
                {childCount(f.id, folders) > 0 ? (
                  <button
                    type="button"
                    className="icon-btn"
                    title={collapsed.has(f.id) ? "Expand" : "Collapse"}
                    onClick={() => toggleCollapse(f.id)}
                  >
                    <Icon icon={collapsed.has(f.id) ? faChevronRight : faChevronDown} />
                  </button>
                ) : (
                  <span className="lib-folder-spacer" />
                )}
                {renameId === f.id ? (
                  <input
                    value={renameVal}
                    autoFocus
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => void renameFolder(f.id)}
                    onKeyDown={(e) => e.key === "Enter" && void renameFolder(f.id)}
                  />
                ) : (
                  <button type="button" className="lib-folder" onClick={() => setFolderId(f.id)}>
                    <Icon icon={faFolder} /> {f.name}
                  </button>
                )}
                {confirmFolder === f.id ? (
                  <button type="button" className="ghost" style={{ gridColumn: "3 / -1" }} title="Queries move to Stash; child folders become top-level" onClick={() => void removeFolder(f.id)}>to Stash</button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="icon-btn"
                      title="New folder inside this one"
                      onClick={() => { setCreating(f.id); setNewFolder(""); }}
                    >
                      <Icon icon={faFolderPlus} />
                    </button>
                    <button type="button" className="icon-btn" title="Rename" onClick={() => { setRenameId(f.id); setRenameVal(f.name); }}>
                      <Icon icon={faPen} />
                    </button>
                    <button type="button" className="icon-btn" title="Delete folder - queries move to Stash, child folders become top-level" onClick={() => setConfirmFolder(f.id)}>
                      <Icon icon={faTrashCan} />
                    </button>
                  </>
                )}
              </div>
              {creating === f.id && (
                <div className="row lib-new-folder" style={{ paddingLeft: 26 + (f.depth + 1) * 12 }}>
                  <input
                    value={newFolder}
                    autoFocus
                    placeholder={`Folder in ${f.name}`}
                    onChange={(e) => setNewFolder(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void makeFolder(f.id)}
                  />
                  <button type="button" className="ghost" onClick={() => void makeFolder(f.id)}>Add</button>
                  <button type="button" className="ghost" onClick={() => setCreating(null)}>Cancel</button>
                </div>
              )}
            </div>
          ))}
          {creating === "root" ? (
            <div className="row lib-new-folder">
              <input
                value={newFolder}
                autoFocus
                placeholder="Folder name"
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void makeFolder(null)}
              />
              <button type="button" className="ghost" onClick={() => void makeFolder(null)}>Add</button>
              <button type="button" className="ghost" onClick={() => setCreating(null)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="ghost" style={{ marginTop: 10 }} onClick={() => { setCreating("root"); setNewFolder(""); }}>
              <Icon icon={faFolderPlus} /> New folder
            </button>
          )}
        </aside>
        <main className="lib-main">
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 className="wiz-display" style={{ fontSize: "1.6rem", margin: 0 }}>Saved queries</h1>
            {folderId === ALL && (
              <button
                type="button"
                className="ghost"
                title="Permanently delete every saved query. Folders stay empty."
                onClick={() => setClearAll(true)}
              >
                <Icon icon={faEraser} /> Clear all
              </button>
            )}
            {folderId !== ALL && folderId !== STASH && (
              <button
                type="button"
                className="ghost"
                title="Permanently delete queries in this folder. The folder stays."
                onClick={() => setClearFolder(folderId)}
              >
                <Icon icon={faEraser} /> Empty folder
              </button>
            )}
          </div>
          <div className="lib-filters">
            <label className="lib-search">
              <Icon icon={faMagnifyingGlass} />
              <input type="text" value={q} placeholder="Search name or description" onChange={(e) => setQ(e.target.value)} />
            </label>
            <MenuSelect
              value={osName}
              placeholder="Any OS"
              options={[{ value: "", label: "Any OS" }, ...osCatalog.map((o) => ({ value: o, label: o }))]}
              onChange={setOsName}
            />
          </div>
          {tags.length > 0 && (
            <div className="tag-row" style={{ marginBottom: 12 }}>
              {tags.map((t) => (
                <button key={t} type="button" className={`lib-tag${tag === t ? " on" : ""}`} onClick={() => setTag((prev) => (prev === t ? "" : t))}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
          {emptyTenant && (
            <div className="panel-block lib-empty">
              <p>This is your per-tenant query library.</p>
              <p className="muted">
                Build a query in the Builder, then <strong>Save</strong> next to Export JSON.
                Display flatten, charts, column order, and color rules travel with it.
                Open as <strong>Builder</strong> to edit, or <strong>Results</strong> to run it and show the table.
              </p>
            </div>
          )}
          {!emptyTenant && !busy && items.length === 0 && (
            <p className="muted">No queries match these filters.</p>
          )}
          <ul className="lib-list">
            {items.map((item) => (
              <li key={item.id} className="panel-block lib-card">
                <div>
                  <div className="lib-card-name">{item.name}</div>
                  {item.description && <p className="muted" style={{ margin: "4px 0 0" }}>{item.description}</p>}
                  <div className="tag-row" style={{ marginTop: 8 }}>
                    <span className="badge">{item.osName}</span>
                    {item.tags.map((t) => (
                      <span key={t} className="lib-tag">{t}</span>
                    ))}
                    <span className="muted" style={{ fontSize: "0.72rem" }}>
                      {item.folderId ? folderPath(item.folderId, folders) || "folder" : "Stash"}
                      {" | "}
                      {item.updatedAt.slice(0, 10)}
                    </span>
                  </div>
                </div>
                <div className="row lib-actions">
                  <button type="button" className="ghost" disabled={!!opening} onClick={() => void open(item.id, "builder")}>
                    <Icon icon={faSliders} /> {opening === item.id + "builder" ? "..." : "Builder"}
                  </button>
                  <button type="button" className="ghost" disabled={!!opening} onClick={() => void open(item.id, "results")}>
                    <Icon icon={faPlay} /> {opening === item.id + "results" ? "..." : "Results"}
                  </button>
                  <button type="button" className="ghost" disabled={!!opening} onClick={() => void open(item.id, "report")}>
                    <Icon icon={faTable} /> {opening === item.id + "report" ? "..." : "Report"}
                  </button>
                  <button type="button" className="ghost" disabled={!!opening} onClick={() => void duplicate(item.id)}>
                    <Icon icon={faClone} /> {opening === item.id + "dup" ? "..." : "Duplicate"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setEdit(item);
                      setEditName(item.name);
                      setEditTags(item.tags.join(" "));
                      setEditFolder(item.folderId ?? STASH);
                    }}
                  >
                    <Icon icon={faPen} /> Edit
                  </button>
                  {confirmId === item.id ? (
                    <button type="button" className="ghost" onClick={() => void removeQuery(item.id)}>Delete for good</button>
                  ) : (
                    <button type="button" className="icon-btn" onClick={() => setConfirmId(item.id)}>
                      <Icon icon={faTrashCan} />
                    </button>
                  )}
                </div>
                {edit?.id === item.id && (
                  <div className="lib-edit">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <input value={editTags} placeholder="tags" onChange={(e) => setEditTags(e.target.value)} />
                    <MenuSelect
                      value={editFolder}
                      options={[{ value: STASH, label: "Stash" }, ...tree.map((f) => ({ value: f.id, label: f.name, depth: f.depth }))]}
                      onChange={setEditFolder}
                    />
                    <button type="button" className="go" onClick={() => void saveEdit()}>Update</button>
                    <button type="button" className="ghost" onClick={() => setEdit(null)}>Cancel</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </main>
      </div>
      {sweep &&
        createPortal(
          <div
            className="import-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !busyClear) {
                setClearAll(false);
                setClearStash(false);
                setClearFolder(null);
              }
            }}
          >
            <div className="import-dialog">
              <label className="lbl"><Icon icon={faEraser} /> {sweep.title}</label>
              <p className="muted display-config-blurb">{sweep.body}</p>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  className="ghost"
                  disabled={busyClear}
                  onClick={() => {
                    setClearAll(false);
                    setClearStash(false);
                    setClearFolder(null);
                  }}
                >
                  Cancel
                </button>
                <button type="button" className="go" disabled={busyClear} onClick={() => void bulkClear(sweep.target)}>
                  {busyClear ? "Deleting..." : sweep.go}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
