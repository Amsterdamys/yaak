import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("@yaakapp-internal/models", () => ({
  environmentsAtom: {},
  foldersAtom: {},
  getModel: () => null,
  patchModel: async () => undefined,
}));
vi.mock("../../hooks/useActiveEnvironment", () => ({ activeEnvironmentAtom: {} }));
vi.mock("../../lib/jotai", () => ({ jotaiStore: { get: () => [], set: () => undefined } }));
vi.mock("../../lib/responseBody", () => ({ getResponseBodyText: async () => "" }));

const { applyToVariables } = await import("./runner");

describe("applyToVariables", () => {
  test("updates in place, enables, appends and removes", () => {
    const next = applyToVariables(
      [
        { id: "a", name: "TOKEN", value: "old", enabled: false },
        { id: "b", name: "GONE", value: "x", enabled: true },
        { id: "c", name: "KEEP", value: "k", enabled: true },
      ],
      [
        { scope: "environment", name: "TOKEN", value: "new" },
        { scope: "environment", name: "GONE", value: null },
        { scope: "environment", name: "ADDED", value: "1" },
      ],
    );
    expect(next.map((v) => [v.name, v.value, v.enabled])).toEqual([
      ["TOKEN", "new", true],
      ["KEEP", "k", true],
      ["ADDED", "1", true],
    ]);
    expect(next[2]?.id).toEqual(expect.any(String));
  });
});
