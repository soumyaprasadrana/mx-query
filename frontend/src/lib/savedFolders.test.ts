/** Saved-query folder tree (Stash is not a folder id). */
import { describe, expect, it } from "vitest";
import { SavedQueryFolder } from "../api";
import { childCount, folderPath, isCollapsedAway, walkFolders } from "./savedFolders";

function folder(id: string, name: string, parentId: string | null = null): SavedQueryFolder {
  return { id, name, parentId, createdAt: "2026-01-01" };
}

describe("walkFolders", () => {
  it("sorts siblings by name and walks depth-first", () => {
    const folders = [
      folder("b", "Beta"),
      folder("a", "Alpha"),
      folder("a1", "Nested", "a"),
    ];
    const walked = walkFolders(folders);
    expect(walked.map((f) => f.id)).toEqual(["a", "a1", "b"]);
    expect(walked.find((f) => f.id === "a1")?.depth).toBe(1);
  });

  it("treats a missing parent as a root (orphan)", () => {
    const walked = walkFolders([folder("x", "Orphan", "gone")]);
    expect(walked).toHaveLength(1);
    expect(walked[0].depth).toBe(0);
  });
});

describe("folderPath / childCount / isCollapsedAway", () => {
  const folders = [
    folder("ops", "Ops"),
    folder("wo", "Work orders", "ops"),
  ];

  it("joins ancestor names", () => {
    expect(folderPath("wo", folders)).toBe("Ops / Work orders");
  });

  it("counts direct children only", () => {
    expect(childCount("ops", folders)).toBe(1);
    expect(childCount("wo", folders)).toBe(0);
  });

  it("hides a folder when an ancestor is collapsed", () => {
    const wo = folders[1];
    expect(isCollapsedAway(wo, new Set(["ops"]), folders)).toBe(true);
    expect(isCollapsedAway(wo, new Set(), folders)).toBe(false);
  });
});
