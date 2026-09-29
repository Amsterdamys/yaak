import type { HttpResponse } from "@yaakapp-internal/models";
import { httpRequestsAtom } from "@yaakapp-internal/models";
import { Banner, HStack, Icon, LoadingIcon, VStack } from "@yaakapp-internal/ui";
import classNames from "classnames";
import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { Button } from "../core/Button";
import { CountBadge } from "../core/CountBadge";
import { IconButton } from "../core/IconButton";
import { Select } from "../core/Select";
import { setActiveTab } from "../core/Tabs/Tabs";
import { EmptyStateText } from "../EmptyStateText";
import { summarize, testRunsAtom } from "./atoms";
import { REQUEST_TABS_STORAGE_KEY, REQUEST_TESTS_TAB } from "./constants";
import { hasTestScript, runRequestTests } from "./runner";
import type { TestStatus } from "./sandbox";

type Filter = "all" | TestStatus;

const FILTER_OPTIONS: { label: string; value: Filter }[] = [
  { label: "All", value: "all" },
  { label: "Passed", value: "passed" },
  { label: "Failed", value: "failed" },
  { label: "Skipped", value: "skipped" },
];

/** The badge on the response pane's Tests tab: passed/total, red when anything failed. */
export function TestResultsBadge({ responseId }: { responseId: string | null }) {
  const runs = useAtomValue(testRunsAtom);
  const run = responseId == null ? null : (runs[responseId] ?? null);
  if (run == null) return null;
  if (run.outcome == null) return <CountBadge count={true} />;
  const summary = summarize(run.outcome);
  return (
    <CountBadge
      count={summary.passed}
      count2={summary.total}
      showZero
      color={summary.ok ? "success" : "danger"}
    />
  );
}

/** The response pane's Tests tab: the results of the script that ran against this response. */
export function TestResultsViewer({ response }: { response: HttpResponse }) {
  const runs = useAtomValue(testRunsAtom);
  const run = runs[response.id] ?? null;
  const request = useAtomValue(httpRequestsAtom).find((r) => r.id === response.requestId) ?? null;
  const [filter, setFilter] = useState<Filter>("all");

  const openTestsTab = () =>
    setActiveTab({
      storageKey: REQUEST_TABS_STORAGE_KEY,
      activeTabKey: response.requestId,
      value: REQUEST_TESTS_TAB,
    });

  const summary = useMemo(() => (run?.outcome ? summarize(run.outcome) : null), [run]);
  const results = useMemo(() => {
    const all = run?.outcome?.results ?? [];
    return filter === "all" ? all : all.filter((r) => r.status === filter);
  }, [filter, run]);

  if (request == null) {
    return <EmptyStateText>The request no longer exists</EmptyStateText>;
  }

  if (run == null) {
    return (
      <EmptyStateText>
        <VStack space={3} alignItems="center">
          {hasTestScript(request) ? (
            <>
              <span>The tests did not run for this response</span>
              <Button
                size="sm"
                variant="border"
                onClick={() => runRequestTests(request, response)}
                disabled={response.state !== "closed"}
              >
                Run tests
              </Button>
            </>
          ) : (
            <>
              <span>No tests for this request</span>
              <Button size="sm" variant="border" onClick={openTestsTab}>
                Write tests
              </Button>
            </>
          )}
        </VStack>
      </EmptyStateText>
    );
  }

  if (run.outcome == null || summary == null) {
    return (
      <EmptyStateText>
        <HStack space={3}>
          <LoadingIcon className="text-text-subtlest" />
          Running tests
        </HStack>
      </EmptyStateText>
    );
  }

  const { outcome } = run;

  return (
    <div className="h-full grid grid-rows-[auto_minmax(0,1fr)] gap-2 pb-2">
      <HStack space={2} alignItems="center" className="text-sm">
        <div className="min-w-0 leading-tight text-text-subtle">
          <span
            className={classNames("font-semibold", summary.ok ? "text-success" : "text-danger")}
          >
            {summary.passed} passed
          </span>
          {summary.failed > 0 && (
            <span className="text-danger font-semibold">, {summary.failed} failed</span>
          )}
          {summary.skipped > 0 && <>, {summary.skipped} skipped</>}
          {outcome.error != null && <span className="text-danger">, script error</span>}
          <span className="text-text-subtlest font-mono text-xs"> {outcome.durationMs}ms</span>
        </div>
        <div className="ml-auto" />
        <Select
          name="tests-filter"
          label="Filter results"
          hideLabel
          size="xs"
          value={filter}
          options={FILTER_OPTIONS}
          onChange={setFilter}
        />
        <IconButton
          size="sm"
          icon="refresh"
          title="Run the tests again against this response"
          onClick={() => runRequestTests(request, response)}
        />
      </HStack>
      <div className="overflow-y-auto min-h-0">
        {outcome.error != null && (
          <Banner color="danger" className="mb-2 font-mono text-xs whitespace-pre-wrap">
            {outcome.error}
          </Banner>
        )}
        {results.length === 0 && summary.total > 0 && (
          <div className="text-text-subtlest italic text-sm py-2">No {filter} tests</div>
        )}
        {results.length === 0 && summary.total === 0 && outcome.error == null && (
          <div className="text-text-subtlest italic text-sm py-2">
            The script ran but declared no tests. Use pm.test(name, fn).
          </div>
        )}
        <ul>
          {results.map((result, i) => (
            <li
              key={`${i}-${result.name}`}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 items-start py-1.5 border-b border-border-subtle text-sm"
            >
              {result.status === "passed" ? (
                <Icon icon="check_circle" color="success" className="mt-0.5" />
              ) : result.status === "failed" ? (
                <Icon icon="circle_alert" color="danger" className="mt-0.5" />
              ) : (
                <Icon icon="circle_dashed" color="secondary" className="mt-0.5" />
              )}
              <div className="min-w-0">
                <div className={classNames(result.status === "skipped" && "text-text-subtle")}>
                  {result.name}
                  {result.status === "skipped" && (
                    <span className="text-text-subtlest"> (skipped)</span>
                  )}
                </div>
                {result.error != null && (
                  <pre className="text-danger font-mono text-xs whitespace-pre-wrap break-words mt-0.5">
                    {result.error}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ul>
        {outcome.logs.length > 0 && (
          <div className="mt-3">
            <div className="text-text-subtlest text-xs uppercase tracking-wide mb-1">Console</div>
            <pre className="font-mono text-xs whitespace-pre-wrap break-words bg-surface-highlight rounded-md p-2">
              {outcome.logs.map((line, i) => (
                <div
                  key={i}
                  className={classNames(
                    line.level === "error" && "text-danger",
                    line.level === "warn" && "text-warning",
                  )}
                >
                  {line.text}
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
