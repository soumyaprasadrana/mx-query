/** Save / Save as a query into a library folder. */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "../../types";
import {
  createSavedQuery,
  createSavedQueryFolder,
  listSavedQueryFolders,
  SavedQuery,
  SavedQueryFolder,
  SavedQueryListItem,
} from "../../api";
import { walkFolders } from "../../lib/savedFolders";
import { Icon, faFloppyDisk } from "../Icon";
import MenuSelect from "../MenuSelect";

const STASH = "__stash__";
const NEW = "__new__";

export default function SaveQueryDialog({
  tenantId,
  osName,
  payload,
  seed,
  onCreated,
  onClose,
}: {
  tenantId: string;
  osName: string;
  payload: Record<string, unknown>;
  /** Prefill for Save as / first save. Does not PATCH - this dialog always creates. */
  seed?: SavedQueryListItem | null;
  onCreated?: (saved: SavedQuery) => void;
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<SavedQueryFolder[]>([]);
  const [name, setName] = useState(seed ? `${seed.name} copy` : "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(seed?.tags ?? []);
  const [folderPick, setFolderPick] = useState(seed?.folderId ?? STASH);
  const [newFolder, setNewFolder] = useState("");
  const [newParent, setNewParent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void listSavedQueryFolders(tenantId)
      .then(setFolders)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }, [tenantId]);

  function addTag() {
    const t = tagInput.trim().slice(0, 40);
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  async function submit() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    try {
      let folderId: string | null = null;
      if (folderPick === NEW) {
        const created = await createSavedQueryFolder(tenantId, newFolder.trim(), newParent || null);
        folderId = created.id;
      } else if (folderPick !== STASH) {
        folderId = folderPick;
      }
      const saved = await createSavedQuery(tenantId, {
        name: trimmed,
        osName,
        payload,
        description: description.trim() || undefined,
        folderId,
        tags,
      });
      setDone(true);
      onCreated?.(saved);
      window.setTimeout(onClose, 700);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const tree = walkFolders(folders);
  const folderOptions = useMemo(
    () => [
      { value: STASH, label: "Stash" },
      ...tree.map((f) => ({ value: f.id, label: f.name, depth: f.depth })),
      { value: NEW, label: "+ New folder" },
    ],
    [tree],
  );
  const parentOptions = useMemo(
    () => [
      { value: "", label: "Top-level" },
      ...tree.map((f) => ({ value: f.id, label: f.name, depth: f.depth })),
    ],
    [tree],
  );

  return createPortal(
    <div className="import-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={`import-dialog${error ? " shake" : ""}`}>
        <label className="lbl"><Icon icon={faFloppyDisk} /> {seed ? "Save as new query" : "Save query"}</label>
        <p className="muted display-config-blurb">
          {seed
            ? `Creates a new library entry. The original "${seed.name}" is unchanged.`
            : "Stores this tenant's export JSON - query plus display - in the library."}
        </p>
        <label className="lbl" style={{ marginTop: 10 }}>
          Name
          <input type="text" value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="lbl">
          Description
          <textarea value={description} maxLength={2000} rows={3} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="lbl">
          Folder
          <MenuSelect
            value={folderPick}
            options={folderOptions}
            onChange={(v) => {
              if (v === NEW && folderPick !== STASH && folderPick !== NEW) setNewParent(folderPick);
              setFolderPick(v);
            }}
          />
        </label>
        {folderPick === NEW && (
          <>
            <label className="lbl">
              New folder name
              <input type="text" value={newFolder} maxLength={120} onChange={(e) => setNewFolder(e.target.value)} />
            </label>
            <label className="lbl">
              Inside
              <MenuSelect value={newParent} options={parentOptions} onChange={setNewParent} />
            </label>
          </>
        )}
        <label className="lbl">
          Tags
          <div className="tag-row">
            {tags.map((t) => (
              <button key={t} type="button" className="lib-tag" onClick={() => setTags((prev) => prev.filter((x) => x !== t))}>
                {t} x
              </button>
            ))}
            <input
              type="text"
              value={tagInput}
              maxLength={40}
              placeholder="add tag"
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
            />
          </div>
        </label>
        {error && <p className="error-box" style={{ marginTop: 10 }}>{error}</p>}
        {done && <p className="muted" style={{ marginTop: 10 }}>Saved.</p>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="go" disabled={busy || done || !name.trim() || (folderPick === NEW && !newFolder.trim())} onClick={() => void submit()}>
            {busy ? "Saving..." : seed ? "Save as" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
