import type { Folder, HttpRequest } from "@yaakapp-internal/models";
import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("./runner", () => ({
  hasTestScript: (r: { testScript: string }) => r.testScript.trim() !== "",
}));

const { collectTestedRequests } = await import("./folderResults");

const folder = (id: string, folderId: string | null, sortPriority = 0): Folder =>
  ({ model: "folder", id, folderId, sortPriority, updatedAt: "2026" }) as Folder;
const request = (
  id: string,
  folderId: string | null,
  testScript: string,
  sortPriority = 0,
): HttpRequest =>
  ({
    model: "http_request",
    id,
    folderId,
    testScript,
    sortPriority,
    updatedAt: "2026",
  }) as HttpRequest;

describe("collectTestedRequests", () => {
  test("walks the folder tree in sidebar order and keeps only requests with tests", () => {
    const folders = [
      folder("f_root", null),
      folder("f_a", "f_root", 2),
      folder("f_b", "f_root", 1),
    ];
    const requests = [
      request("rq_top", "f_root", "pm.test()", 0),
      request("rq_a", "f_a", "pm.test()"),
      request("rq_b", "f_b", "pm.test()"),
      request("rq_none", "f_b", "   "),
      request("rq_elsewhere", null, "pm.test()"),
    ];
    const ids = collectTestedRequests(folders, requests, "f_root").map((r) => r.id);
    expect(ids).toEqual(["rq_top", "rq_b", "rq_a"]);
  });
});
