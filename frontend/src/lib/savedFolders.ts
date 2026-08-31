/** Folder tree helpers for the saved-query library. */
import { SavedQueryFolder } from "../api";

export type FolderNode = SavedQueryFolder & { depth: number };

export function walkFolders(folders: SavedQueryFolder[]): FolderNode[] {
  const byParent = new Map<string | null, SavedQueryFolder[]>();
  const ids = new Set(folders.map((f) => f.id));
  for (const f of folders) {
    const parent = f.parentId && ids.has(f.parentId) ? f.parentId : null;
    const list = byParent.get(parent) ?? [];
    list.push(f);
    byParent.set(parent, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const out: FolderNode[] = [];
  const seen = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    for (const f of byParent.get(parentId) ?? []) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ ...f, depth });
      visit(f.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

export function folderPath(id: string, folders: SavedQueryFolder[]): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  const guard = new Set<string>();
  let cur = byId.get(id);
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(" / ");
}

export function childCount(id: string, folders: SavedQueryFolder[]): number {
  return folders.filter((f) => f.parentId === id).length;
}

export function isCollapsedAway(folder: SavedQueryFolder, collapsed: Set<string>, folders: SavedQueryFolder[]): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let p = folder.parentId;
  const guard = new Set<string>();
  while (p && !guard.has(p)) {
    guard.add(p);
    if (collapsed.has(p)) return true;
    p = byId.get(p)?.parentId ?? null;
  }
  return false;
}
