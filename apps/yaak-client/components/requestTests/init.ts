import type { HttpResponse, ModelPayload } from "@yaakapp-internal/models";
import { platform } from "@yaakapp-internal/platform";
import { runTestsForFinishedResponse } from "./runner";

/** Response ids whose tests already ran, so a later write to a finished response is ignored. */
const MAX_REMEMBERED = 1000;

/**
 * A response reaches the client as model writes: one when the send starts, more while the
 * body streams, and a last one with state "closed". Tests run once, on that last write.
 *
 * Hooking the writes rather than the Send button covers every way a request gets sent: the
 * folder's "Send All" (a bundled plugin sending from the Rust side), the sidebar's multi-select
 * send, a plugin, the CLI while the app is open. A response another window sent is that
 * window's job, or its tests would run twice.
 */
export function finishedResponses(
  payloads: ModelPayload[],
  windowLabel: string,
  handled: Set<string>,
): HttpResponse[] {
  const out: HttpResponse[] = [];
  for (const payload of payloads) {
    if (payload.change.type !== "upsert") continue;
    const model = payload.model;
    if (model.model !== "http_response" || model.state !== "closed") continue;
    const source = payload.updateSource;
    if (source.type === "window" && source.label !== windowLabel) continue;
    if (handled.has(model.id)) continue;
    remember(handled, model.id);
    out.push(model);
  }
  return out;
}

function remember(handled: Set<string>, id: string) {
  handled.add(id);
  if (handled.size <= MAX_REMEMBERED) return;
  const oldest = handled.values().next().value;
  if (oldest != null) handled.delete(oldest);
}

const handled = new Set<string>();

/** Start running request tests whenever a response finishes. Called once at startup. */
export function initRequestTests() {
  platform.listen<ModelPayload[]>("model_writes", (payloads) => {
    for (const response of finishedResponses(payloads, platform.window.label, handled)) {
      runTestsForFinishedResponse(response);
    }
  });
}
