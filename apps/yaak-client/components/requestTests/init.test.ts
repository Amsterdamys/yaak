import type { ModelPayload } from "@yaakapp-internal/models";
import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("@yaakapp-internal/platform", () => ({
  platform: { listen: () => () => undefined, window: { label: "main" } },
}));
vi.mock("./runner", () => ({ runTestsForFinishedResponse: () => undefined }));

const { finishedResponses } = await import("./init");

function write(
  id: string,
  state: "initialized" | "connected" | "closed",
  updateSource: ModelPayload["updateSource"] = { type: "window", label: "main" },
  type: "upsert" | "delete" = "upsert",
): ModelPayload {
  return {
    model: { model: "http_response", id, requestId: "rq_1", state } as never,
    updateSource,
    change: { type } as never,
  };
}

describe("finishedResponses", () => {
  test("picks each closed response once, from this window or a non-window source", () => {
    const handled = new Set<string>();
    const first = finishedResponses(
      [
        write("rs_1", "initialized"),
        write("rs_1", "connected"),
        write("rs_1", "closed"),
        write("rs_2", "closed", { type: "plugin" }),
        write("rs_3", "closed", { type: "window", label: "other" }),
        write("rs_4", "closed", undefined, "delete"),
        { ...write("rs_5", "closed"), model: { model: "http_request", id: "rs_5" } as never },
      ],
      "main",
      handled,
    );
    expect(first.map((r) => r.id)).toEqual(["rs_1", "rs_2"]);

    const again = finishedResponses(
      [write("rs_1", "closed"), write("rs_6", "closed")],
      "main",
      handled,
    );
    expect(again.map((r) => r.id)).toEqual(["rs_6"]);
  });

  test("forgets the oldest ids once the memory is full", () => {
    const handled = new Set<string>();
    for (let i = 0; i < 1001; i++) finishedResponses([write(`rs_${i}`, "closed")], "main", handled);
    expect(handled.size).toBe(1000);
    expect(handled.has("rs_0")).toBe(false);
    expect(handled.has("rs_1000")).toBe(true);
  });
});
