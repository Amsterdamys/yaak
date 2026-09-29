import type { EditorView } from "@codemirror/view";
import type { HttpRequest } from "@yaakapp-internal/models";
import { patchModelDebounced } from "@yaakapp-internal/models";
import { HStack, Icon } from "@yaakapp-internal/ui";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import { useLatestHttpResponse } from "../../hooks/useLatestHttpResponse";
import { useRequestUpdateKey } from "../../hooks/useRequestUpdateKey";
import { Button } from "../core/Button";
import { Checkbox } from "../core/Checkbox";
import type { DropdownItem } from "../core/Dropdown";
import { Dropdown } from "../core/Dropdown";
import { Editor } from "../core/Editor/LazyEditor";
import { setActiveTab } from "../core/Tabs/Tabs";
import { runTestsOnSendAtom, testRunsAtom } from "./atoms";
import { RESPONSE_TABS_STORAGE_KEY, RESPONSE_TESTS_TAB } from "./constants";
import { testScriptExtensions } from "./editorExtensions";
import { runRequestTests } from "./runner";
import type { Snippet } from "./snippets";
import { insertSnippet, SNIPPETS } from "./snippets";

interface Props {
  request: HttpRequest;
}

const PLACEHOLDER = [
  'pm.test("Status code is 200", () => {',
  "  pm.response.to.have.status(200);",
  "});",
].join("\n");

/**
 * The request's Tests tab: Postman's post-response script. A JavaScript editor with
 * completion for the pm API, the snippet panel, and the switch that decides whether the
 * script runs after every send.
 */
export function RequestTestsEditor({ request }: Props) {
  const updateKey = useRequestUpdateKey(request.id);
  const latestResponse = useLatestHttpResponse(request.id);
  const runs = useAtomValue(testRunsAtom);
  const running = latestResponse != null && runs[latestResponse.id]?.state === "running";
  const [runOnSendRecord, setRunOnSendRecord] = useAtom(runTestsOnSendAtom);
  const runOnSend = runOnSendRecord[request.id] !== false;
  const viewRef = useRef<EditorView | null>(null);
  const extensions = useMemo(() => testScriptExtensions(), []);

  const handleChange = useCallback(
    (testScript: string) => patchModelDebounced(request, { testScript }),
    [request],
  );

  const runNow = useCallback(async () => {
    if (latestResponse == null) return;
    await Promise.all([
      runRequestTests(request, latestResponse),
      setActiveTab({
        storageKey: RESPONSE_TABS_STORAGE_KEY,
        activeTabKey: request.id,
        value: RESPONSE_TESTS_TAB,
      }),
    ]);
  }, [latestResponse, request]);

  const snippetItems = useMemo<DropdownItem[]>(() => {
    const items: DropdownItem[] = [];
    let group: Snippet["group"] | null = null;
    for (const s of SNIPPETS) {
      if (s.group !== group) {
        group = s.group;
        items.push({ type: "separator", label: group });
      }
      items.push({
        label: s.title,
        onSelect: () => {
          const view = viewRef.current;
          if (view != null) insertSnippet(view, s.code);
        },
      });
    }
    return items;
  }, []);

  return (
    <div className="h-full grid grid-rows-[auto_minmax(0,1fr)] gap-1">
      <HStack space={2} alignItems="center" className="pl-1">
        <Checkbox
          size="sm"
          checked={runOnSend}
          title={<span className="whitespace-nowrap">Run on send</span>}
          help="Run the tests after every send. Untick to send without running them; you can still run them from here."
          onChange={(checked) =>
            setRunOnSendRecord((v) => ({ ...v, [request.id]: checked ? undefined : false }))
          }
        />
        <div className="ml-auto" />
        <Button
          size="xs"
          variant="border"
          color="secondary"
          disabled={latestResponse == null || running}
          title={
            latestResponse == null
              ? "Send the request first"
              : "Run the tests against the last response without sending again"
          }
          leftSlot={<Icon icon={running ? "refresh" : "circle_play"} size="sm" spin={running} />}
          onClick={runNow}
        >
          Run
        </Button>
        <Dropdown items={snippetItems}>
          <Button
            size="xs"
            variant="border"
            color="secondary"
            leftSlot={<Icon icon="code" size="sm" />}
            rightSlot={<Icon icon="chevron_down" size="sm" />}
            title="Insert a ready-made test at the cursor"
          >
            Snippets
          </Button>
        </Dropdown>
      </HStack>
      <div className="h-full min-h-0">
        <Editor
          language="javascript"
          heightMode="full"
          placeholder={PLACEHOLDER}
          stateKey={`tests.${request.id}`}
          forceUpdateKey={updateKey}
          defaultValue={request.testScript}
          onChange={handleChange}
          extraExtensions={extensions}
          setRef={(view) => {
            viewRef.current = view;
          }}
        />
      </div>
    </div>
  );
}
