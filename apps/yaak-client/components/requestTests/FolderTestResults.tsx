import type { Folder, HttpRequest, HttpResponse } from "@yaakapp-internal/models";
import { foldersAtom, httpRequestsAtom, httpResponsesAtom } from "@yaakapp-internal/models";
import { Heading, HStack, Icon, LoadingIcon } from "@yaakapp-internal/ui";
import classNames from "classnames";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { resolvedModelName } from "../../lib/resolvedModelName";
import { router } from "../../lib/router";
import { Button } from "../core/Button";
import { CountBadge } from "../core/CountBadge";
import { setActiveTab } from "../core/Tabs/Tabs";
import type { TestRun } from "./atoms";
import { summarize, testRunsAtom } from "./atoms";
import { RESPONSE_TABS_STORAGE_KEY, RESPONSE_TESTS_TAB } from "./constants";
import { collectTestedRequests } from "./folderResults";
import { runRequestTests } from "./runner";

interface Row {
  request: HttpRequest;
  /** The latest response, whatever its state */
  response: HttpResponse | null;
  run: TestRun | null;
}

/**
 * The folder page's test report: one line per request under the folder that has tests, with
 * the result of its latest response, and the totals. Fills in live while "Send All" runs.
 * Renders nothing for folders without tests, so the page stays as upstream made it.
 */
export function FolderTestResults({ folder }: { folder: Folder }) {
  const folders = useAtomValue(foldersAtom);
  const requests = useAtomValue(httpRequestsAtom);
  const responses = useAtomValue(httpResponsesAtom);
  const runs = useAtomValue(testRunsAtom);

  const rows = useMemo<Row[]>(() => {
    return collectTestedRequests(folders, requests, folder.id).map((request) => {
      const response = responses.find((r) => r.requestId === request.id) ?? null;
      const run = response == null ? null : (runs[response.id] ?? null);
      return { request, response, run };
    });
  }, [folder.id, folders, requests, responses, runs]);

  const totals = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let ran = 0;
    let running = 0;
    for (const { run } of rows) {
      if (run == null) continue;
      if (run.outcome == null) {
        running++;
        continue;
      }
      ran++;
      const s = summarize(run.outcome);
      passed += s.passed;
      failed += s.failed + (run.outcome.error == null ? 0 : 1);
    }
    return { passed, failed, ran, running, notRun: rows.length - ran - running };
  }, [rows]);

  const runnable = rows.filter((r) => r.response?.state === "closed");
  const runAll = useCallback(() => {
    for (const { request, response } of runnable) {
      if (response != null) runRequestTests(request, response).catch(console.error);
    }
  }, [runnable]);

  if (rows.length === 0) return null;

  return (
    <section className="mb-8" data-testid="folder-test-results">
      <HStack space={2} alignItems="center">
        <Heading level={2}>Tests</Heading>
        <div className="text-sm text-text-subtle">
          {totals.running > 0 && <LoadingIcon size="sm" className="inline-block mr-1" />}
          {totals.ran === 0 && totals.running === 0 ? (
            <>Not run yet. Send All runs every request's tests.</>
          ) : (
            <>
              <span
                className={classNames(
                  "font-semibold",
                  totals.failed === 0 ? "text-success" : "text-danger",
                )}
              >
                {totals.passed} passed
              </span>
              {totals.failed > 0 && (
                <span className="text-danger font-semibold">, {totals.failed} failed</span>
              )}
              <span>
                {" "}
                &bull; {totals.ran} of {rows.length} requests ran
              </span>
            </>
          )}
        </div>
        <div className="ml-auto" />
        <Button
          size="xs"
          variant="border"
          color="secondary"
          disabled={runnable.length === 0 || totals.running > 0}
          title="Run every request's tests again against its latest response, without sending"
          leftSlot={<Icon icon="circle_play" size="sm" />}
          onClick={runAll}
        >
          Run all tests
        </Button>
      </HStack>
      <ul className="mt-3 rounded-lg border border-border divide-y divide-border-subtle bg-surface-highlight">
        {rows.map((row) => (
          <ResultRow key={row.request.id} row={row} />
        ))}
      </ul>
    </section>
  );
}

function ResultRow({ row }: { row: Row }) {
  const { request, response, run } = row;
  const summary = run?.outcome ? summarize(run.outcome) : null;

  const open = useCallback(async () => {
    await router.navigate({
      to: "/workspaces/$workspaceId",
      params: { workspaceId: request.workspaceId },
      search: (prev) => ({ ...prev, request_id: request.id }),
    });
    await setActiveTab({
      storageKey: RESPONSE_TABS_STORAGE_KEY,
      activeTabKey: request.id,
      value: RESPONSE_TESTS_TAB,
    });
  }, [request.id, request.workspaceId]);

  let status: React.ReactNode;
  if (run != null && run.outcome == null) {
    status = <LoadingIcon size="sm" />;
  } else if (summary != null) {
    status = (
      <HStack space={1} alignItems="center">
        <Icon
          icon={summary.ok ? "check_circle" : "circle_alert"}
          color={summary.ok ? "success" : "danger"}
          size="sm"
        />
        <CountBadge
          count={summary.passed}
          count2={summary.total}
          showZero
          color={summary.ok ? "success" : "danger"}
        />
        {run?.outcome?.error != null && <span className="text-danger text-xs">script error</span>}
      </HStack>
    );
  } else if (response == null) {
    status = <span className="text-text-subtlest text-xs">Not sent</span>;
  } else if (response.state !== "closed") {
    status = <LoadingIcon size="sm" />;
  } else {
    status = <span className="text-text-subtlest text-xs">Did not run</span>;
  }

  return (
    <li>
      <button
        type="button"
        onClick={open}
        title="Open the request's test results"
        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-active"
      >
        <span className="font-mono text-xs text-text-subtle w-12 shrink-0 truncate">
          {request.method}
        </span>
        <span className="flex-1 min-w-0 truncate">{resolvedModelName(request)}</span>
        <span className="shrink-0">{status}</span>
      </button>
    </li>
  );
}
