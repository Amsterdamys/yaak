import type { Environment, Folder, HttpRequest, HttpResponse } from "@yaakapp-internal/models";
import { environmentsAtom, foldersAtom, getModel, patchModel } from "@yaakapp-internal/models";
import { activeEnvironmentAtom } from "../../hooks/useActiveEnvironment";
import { jotaiStore } from "../../lib/jotai";
import { getResponseBodyText } from "../../lib/responseBody";
import { ensurePairId } from "../core/PairEditor.util";
import type { TestRun } from "./atoms";
import { runTestsOnSendAtom, testRunsAtom } from "./atoms";
import type { WorkerReply, WorkerRequest } from "./runner.worker";
import type { SandboxInput, SandboxOutcome, VariableScope, VariableUpdate } from "./sandbox";

const TIMEOUT_MS = 10_000;
const MAX_STORED_RUNS = 200;

export function hasTestScript(request: HttpRequest): boolean {
  return request.testScript.trim() !== "";
}

/**
 * Called by the send hook with every finished response. Runs the request's script unless
 * there is none or the request has "Run on send" switched off. Never throws.
 */
export function runTestsAfterSend(requestId: string, response: HttpResponse | null) {
  if (response == null) return;
  const request = getModel("http_request", requestId);
  if (request == null || !hasTestScript(request)) return;
  if (jotaiStore.get(runTestsOnSendAtom)[requestId] === false) return;
  runRequestTests(request, response).catch(console.error);
}

/** Run the request's script against the response and store the result for the Tests tab. */
export async function runRequestTests(
  request: HttpRequest,
  response: HttpResponse,
): Promise<TestRun> {
  const base = { requestId: request.id, responseId: response.id, startedAt: Date.now() };
  storeRun({ ...base, state: "running", outcome: null });

  let outcome: SandboxOutcome;
  try {
    const input = await buildInput(request, response);
    outcome = await runInWorker(input);
    await applyVariableUpdates(request, outcome.variableUpdates, outcome);
  } catch (err) {
    outcome = {
      results: [],
      logs: [],
      variableUpdates: [],
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - base.startedAt,
    };
  }

  const run: TestRun = { ...base, state: "done", outcome };
  storeRun(run);
  return run;
}

function storeRun(run: TestRun) {
  jotaiStore.set(testRunsAtom, (prev) => {
    const next = { ...prev, [run.responseId]: run };
    const keys = Object.keys(next);
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_STORED_RUNS))) delete next[key];
    return next;
  });
}

async function buildInput(request: HttpRequest, response: HttpResponse): Promise<SandboxInput> {
  let body = "";
  try {
    body = (await getResponseBodyText({ response, filter: null })) ?? "";
  } catch (err) {
    console.warn("Could not read the response body for the tests", err);
  }

  const { environmentTarget, collectionTarget, resolved } = collectVariables(request);

  return {
    script: request.testScript,
    response: {
      status: response.status,
      statusReason: response.statusReason ?? "",
      headers: response.headers.map((h) => ({ name: h.name, value: h.value })),
      body,
      elapsed: response.elapsed,
      url: response.url,
      contentLength: response.contentLength,
    },
    request: {
      id: request.id,
      name: request.name,
      url: response.url || request.url,
      method: request.method,
      headers: response.requestHeaders.map((h) => ({ name: h.name, value: h.value })),
    },
    variables: {
      environmentName: environmentTarget?.name ?? null,
      environment: enabledVariables(environmentTarget),
      collection: enabledVariables(collectionTarget),
      resolved,
    },
  };
}

function enabledVariables(environment: Environment | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of environment?.variables ?? []) {
    if (v.enabled === false || v.name === "") continue;
    out[v.name] = v.value;
  }
  return out;
}

function parentFolders(folders: Folder[], folderId: string | null): Folder[] {
  const out: Folder[] = [];
  let id = folderId;
  while (id != null) {
    const folder = folders.find((f) => f.id === id);
    if (folder == null || out.includes(folder)) break;
    out.push(folder);
    id = folder.folderId ?? null;
  }
  return out;
}

/**
 * The scopes a script writes to and what it reads, mirroring useEnvironmentVariables: folder
 * variables from the nearest folder outwards, then the active environment, then the base.
 * `pm.environment` targets the active environment, or the base when none is selected.
 */
export function collectVariables(request: HttpRequest): {
  environmentTarget: Environment | null;
  collectionTarget: Environment | null;
  resolved: Record<string, string>;
} {
  const environments = jotaiStore
    .get(environmentsAtom)
    .filter((e) => e.workspaceId === request.workspaceId);
  const active = jotaiStore.get(activeEnvironmentAtom);
  const base = environments.find((e) => e.parentModel === "workspace") ?? null;
  const folders = parentFolders(jotaiStore.get(foldersAtom), request.folderId);
  const folderEnvironments = folders
    .map((f) => environments.find((e) => e.parentModel === "folder" && e.parentId === f.id) ?? null)
    .filter((e): e is Environment => e != null);

  const resolved: Record<string, string> = {};
  for (const env of [...folderEnvironments, active, base]) {
    for (const [name, value] of Object.entries(enabledVariables(env))) {
      if (!(name in resolved)) resolved[name] = value;
    }
  }

  return { environmentTarget: active ?? base, collectionTarget: base, resolved };
}

/** Write `pm.environment.set` and friends back to the environments they targeted. */
export async function applyVariableUpdates(
  request: HttpRequest,
  updates: VariableUpdate[],
  outcome: SandboxOutcome,
) {
  if (updates.length === 0) return;
  const { environmentTarget, collectionTarget } = collectVariables(request);
  const targets: Record<VariableScope, Environment | null> = {
    environment: environmentTarget,
    collection: collectionTarget,
  };

  for (const scope of ["environment", "collection"] as const) {
    const scoped = updates.filter((u) => u.scope === scope);
    if (scoped.length === 0) continue;
    const target = targets[scope];
    if (target == null) {
      outcome.logs.push({
        level: "error",
        text: `Could not save ${scoped.map((u) => u.name).join(", ")}: the workspace has no environment to write to.`,
      });
      continue;
    }
    patchModel(target, { variables: applyToVariables(target.variables, scoped) }).catch(
      console.error,
    );
  }
}

export function applyToVariables(
  variables: Environment["variables"],
  updates: VariableUpdate[],
): Environment["variables"] {
  let next = [...variables];
  for (const update of updates) {
    if (update.value == null) {
      next = next.filter((v) => v.name !== update.name);
      continue;
    }
    const existing = next.find((v) => v.name === update.name);
    if (existing != null) {
      next = next.map((v) =>
        v === existing ? { ...v, value: update.value as string, enabled: true } : v,
      );
    } else {
      next.push(ensurePairId({ name: update.name, value: update.value, enabled: true }));
    }
  }
  return next;
}

let nextRunId = 1;

function runInWorker(input: SandboxInput): Promise<SandboxOutcome> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./runner.worker.ts", import.meta.url), { type: "module" });
    const id = nextRunId++;
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      reject(
        new Error(
          `The test script did not finish within ${TIMEOUT_MS / 1000} seconds and was stopped.`,
        ),
      );
    }, TIMEOUT_MS);

    worker.addEventListener("message", (e: MessageEvent<WorkerReply>) => {
      if (e.data.id !== id) return;
      finish();
      resolve(e.data.outcome);
    });
    worker.addEventListener("error", (e) => {
      finish();
      reject(new Error(e.message || "The test runner crashed"));
    });
    worker.postMessage({ id, input } satisfies WorkerRequest);
  });
}
