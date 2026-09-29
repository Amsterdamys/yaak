import type { Folder, HttpRequest } from "@yaakapp-internal/models";
import { hasTestScript } from "./runner";

type Ordered = Pick<Folder, "sortPriority" | "updatedAt">;

/** Sibling order as the sidebar and "Send All" show it. */
function compareByOrder(a: Ordered, b: Ordered): number {
  if (a.sortPriority === b.sortPriority) return a.updatedAt > b.updatedAt ? 1 : -1;
  return a.sortPriority - b.sortPriority;
}

/**
 * The HTTP requests with a test script under a folder, depth-first in tree order: the
 * same requests, in the same order, that "Send All" sends.
 */
export function collectTestedRequests(
  folders: Folder[],
  requests: HttpRequest[],
  folderId: string,
): HttpRequest[] {
  const out: HttpRequest[] = [];
  const visited = new Set<string>();
  const walk = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const children: (Folder | HttpRequest)[] = [
      ...folders.filter((f) => f.folderId === id),
      ...requests.filter((r) => r.folderId === id),
    ].sort(compareByOrder);
    for (const child of children) {
      if (child.model === "folder") walk(child.id);
      else if (hasTestScript(child)) out.push(child);
    }
  };
  walk(folderId);
  return out;
}
