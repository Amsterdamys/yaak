/**
 * Runs one test script off the main thread. A worker is created per run and terminated
 * afterwards, so scripts cannot see each other and a runaway one can be stopped.
 */
import type { SandboxInput, SandboxOutcome } from "./sandbox";
import { runTestScript } from "./sandbox";

export interface WorkerRequest {
  id: number;
  input: SandboxInput;
}

export interface WorkerReply {
  id: number;
  outcome: SandboxOutcome;
}

const scope = self as unknown as {
  postMessage(message: WorkerReply): void;
  addEventListener(type: "message", listener: (e: MessageEvent<WorkerRequest>) => void): void;
};

scope.addEventListener("message", async (e) => {
  const outcome = await runTestScript(e.data.input);
  scope.postMessage({ id: e.data.id, outcome });
});
