import type { HttpRequest } from "@yaakapp-internal/models";
import { patchModel } from "@yaakapp-internal/models";
import { Icon } from "@yaakapp-internal/ui";
import classNames from "classnames";
import type { GraphQLSchema } from "graphql";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { wasUpdatedExternally } from "../../../hooks/useRequestUpdateKey";
import { jotaiStore } from "../../../lib/jotai";
import { normalizeGraphQLBody } from "../../../lib/requestBodyConversion";
import { IconButton } from "../../core/IconButton";
import { PlainInput } from "../../core/PlainInput";
import { ErrorBoundary } from "../../ErrorBoundary";
import { showGraphQLBuilderAtom } from "./builderAtoms";
import type { FieldFilter } from "./filter";
import { buildFieldFilter } from "./filter";
import { Explorer } from "./graphiql-explorer/Explorer";
import "./builder.css";

interface Props {
  schema: GraphQLSchema;
  request: HttpRequest;
  style?: CSSProperties;
  className?: string;
  /** Initial search box text (tests). */
  defaultFilter?: string;
}

/**
 * The subset of graphiql-explorer's props this panel uses. The vendored file is untyped
 * (`@ts-nocheck`), so the contract is declared here, next to the only caller.
 */
interface ExplorerProps {
  schema: GraphQLSchema;
  query: string;
  onEdit: (query: string) => void;
  explorerIsOpen: boolean;
  onToggleExplorer: () => void;
  showAttribution: boolean;
  colors: Record<string, string>;
  styles: Record<string, CSSProperties>;
  arrowOpen: ReactNode;
  arrowClosed: ReactNode;
  checkboxChecked: ReactNode;
  checkboxUnchecked: ReactNode;
  filter: FieldFilter | null;
}

const TypedExplorer = Explorer as unknown as ComponentType<ExplorerProps>;

/** Same palette as the CodeMirror GraphQL highlighting in core/Editor/extensions.ts. */
const colors = {
  keyword: "var(--danger)",
  def: "var(--text)",
  property: "var(--primary)",
  qualifier: "var(--info)",
  attribute: "var(--primary)",
  number: "var(--warning)",
  string: "var(--notice)",
  builtin: "var(--warning)",
  string2: "var(--notice)",
  variable: "var(--success)",
  atom: "var(--danger)",
};

const styles: Record<string, CSSProperties> = {
  buttonStyle: {
    fontSize: "1em",
    padding: 0,
    background: "transparent",
    border: "none",
    margin: 0,
    height: "1.5rem",
    width: "auto",
    display: "inline-block",
    maxWidth: "none",
    color: "inherit",
  },
  actionButtonStyle: {
    padding: 0,
    background: "transparent",
    border: "none",
    margin: "0 0 0 0.25rem",
    maxWidth: "none",
    height: "1rem",
    width: "1rem",
    display: "inline-block",
    fontSize: "smaller",
    color: "inherit",
  },
  explorerActionsStyle: {
    margin: 0,
    padding: "0.5rem 0 0",
    width: "100%",
    textAlign: "left",
    background: "none",
  },
};

/**
 * The click-to-build side panel for a GraphQL request: a checkbox tree of the schema that
 * rewrites the request's query text, and follows the text when it is edited by hand.
 *
 * The request model is the single source of truth. Ticking a field patches the model; once the
 * store reflects that write, the request is marked as updated externally, which makes the
 * editor reload its text. Typing in the editor patches the model (debounced), and this
 * component re-renders from the new body.
 */
export function GraphQLQueryBuilder({
  schema,
  request,
  style,
  className,
  defaultFilter = "",
}: Props) {
  const body = useMemo(() => normalizeGraphQLBody(request.body), [request.body]);
  const [filterInput, setFilterInput] = useState(defaultFilter);
  // What the tree filters on: the input, a beat behind, so a big schema is not re-walked and
  // re-rendered on every keystroke.
  const [filterText, setFilterText] = useState(defaultFilter);
  useEffect(() => {
    const timer = setTimeout(() => setFilterText(filterInput), 150);
    return () => clearTimeout(timer);
  }, [filterInput]);
  // The search input is uncontrolled; remounting it is how "clear" empties it.
  const [filterInputKey, setFilterInputKey] = useState(0);
  const filter = useMemo(() => buildFieldFilter(schema, filterText), [schema, filterText]);
  const clearFilter = useCallback(() => {
    setFilterInput("");
    setFilterText("");
    setFilterInputKey((k) => k + 1);
  }, []);

  // The query text this panel last wrote. The store applies a write only when the model_writes
  // event comes back, after patchModel resolves, so the editor is told to reload from the
  // effect below, once the model actually carries the new text.
  const pendingQuery = useRef<string | null>(null);

  const handleEdit = useCallback(
    (query: string) => {
      if (query === body.query) return;
      pendingQuery.current = query;
      patchModel(request, { body: { ...body, query } }).catch(console.error);
    },
    [body, request],
  );

  useEffect(() => {
    if (pendingQuery.current == null || pendingQuery.current !== body.query) return;
    pendingQuery.current = null;
    wasUpdatedExternally(request.id);
  }, [body.query, request.id]);

  const close = useCallback(() => {
    jotaiStore.set(showGraphQLBuilderAtom, (v) => ({ ...v, [request.id]: undefined }));
  }, [request.id]);

  return (
    <div className={classNames(className, "yaak-graphql-builder py-3 mx-3")} style={style}>
      <div className="grid grid-rows-[auto_auto_minmax(0,1fr)] h-full border border-dashed border-border rounded-lg overflow-hidden">
        <nav className="pl-4 pr-1 h-lg grid grid-rows-1 grid-cols-[minmax(0,1fr)_auto] items-center min-w-0 gap-1">
          <div className="flex items-center gap-2 text-text-subtle text-sm whitespace-nowrap">
            <Icon icon="check_square_checked" />
            Query Builder
          </div>
          <div className="ml-auto flex gap-1 *:text-text-subtle">
            <IconButton icon="x" size="sm" title="Close query builder" onClick={close} />
          </div>
        </nav>
        <div className="px-3 pb-2">
          <PlainInput
            key={filterInputKey}
            size="sm"
            label="Filter fields"
            hideLabel
            placeholder="Filter fields, or /regex/"
            defaultValue={filterInput}
            onChange={setFilterInput}
            leftSlot={
              <div className="w-10 flex justify-center items-center">
                <Icon size="sm" icon="search" color="secondary" />
              </div>
            }
            rightSlot={
              filterInput === "" ? null : (
                <IconButton
                  icon="x"
                  size="xs"
                  title="Clear filter"
                  className="mr-1 text-text-subtle"
                  onClick={clearFilter}
                />
              )
            }
          />
        </div>
        <div className="overflow-auto h-full w-full px-3 pb-3">
          <ErrorBoundary name="GraphQLQueryBuilder">
            <TypedExplorer
              schema={schema}
              query={body.query}
              onEdit={handleEdit}
              explorerIsOpen
              onToggleExplorer={close}
              showAttribution={false}
              colors={colors}
              styles={styles}
              filter={filter}
              arrowOpen={<Icon icon="chevron_down" size="md" />}
              arrowClosed={<Icon icon="chevron_right" size="md" />}
              checkboxChecked={<Icon icon="check_square_checked" size="md" color="primary" />}
              checkboxUnchecked={<Icon icon="check_square_unchecked" size="md" color="secondary" />}
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
