import type { HttpRequest } from "@yaakapp-internal/models";
import type { SlotProps } from "@yaakapp-internal/ui";
import { SplitLayout } from "@yaakapp-internal/ui";
import classNames from "classnames";
import { useAtomValue } from "jotai";
import type { CSSProperties } from "react";
import { useCurrentGraphQLSchema } from "../hooks/useIntrospectGraphQL";
import { activeWorkspaceAtom } from "../hooks/useActiveWorkspace";
import { workspaceLayoutAtom } from "../lib/atoms";
import { showGraphQLBuilderAtom } from "./graphql/builder/builderAtoms";
import { GraphQLQueryBuilder } from "./graphql/builder/GraphQLQueryBuilder";
import { GraphQLDocsExplorer } from "./graphql/GraphQLDocsExplorer";
import { showGraphQLDocExplorerAtom } from "./graphql/graphqlAtoms";
import { HttpRequestPane } from "./HttpRequestPane";
import { HttpResponsePane } from "./HttpResponsePane";

interface Props {
  activeRequest: HttpRequest;
  style: CSSProperties;
}

export function HttpRequestLayout({ activeRequest, style }: Props) {
  const showGraphQLDocExplorer = useAtomValue(showGraphQLDocExplorerAtom);
  const showGraphQLBuilder = useAtomValue(showGraphQLBuilderAtom);
  const graphQLSchema = useCurrentGraphQLSchema(activeRequest);
  const workspaceLayout = useAtomValue(workspaceLayoutAtom);
  const activeWorkspace = useAtomValue(activeWorkspaceAtom);
  const wsId = activeWorkspace?.id ?? "n/a";

  const requestResponseSplit = ({ style }: Pick<SlotProps, "style">) => (
    <SplitLayout
      storageKey={`http_layout::${wsId}`}
      className="p-3 gap-1.5"
      style={style}
      layout={workspaceLayout}
      firstSlot={({ orientation, style }) => (
        <HttpRequestPane
          style={style}
          activeRequest={activeRequest}
          fullHeight={orientation === "horizontal"}
        />
      )}
      secondSlot={({ style }) => (
        <HttpResponsePane activeRequestId={activeRequest.id} style={style} />
      )}
    />
  );

  if (activeRequest.bodyType === "graphql" && graphQLSchema != null) {
    // One side panel at a time: the query builder or the docs explorer, sharing the split state.
    const sidePanel =
      showGraphQLBuilder[activeRequest.id] === true
        ? ({ style, orientation }: SlotProps) => (
            <GraphQLQueryBuilder
              request={activeRequest}
              schema={graphQLSchema}
              className={classNames(orientation === "horizontal" && "ml-0!")}
              style={style}
            />
          )
        : showGraphQLDocExplorer[activeRequest.id] !== undefined
          ? ({ style, orientation }: SlotProps) => (
              <GraphQLDocsExplorer
                requestId={activeRequest.id}
                schema={graphQLSchema}
                className={classNames(orientation === "horizontal" && "ml-0!")}
                style={style}
              />
            )
          : null;

    if (sidePanel != null) {
      return (
        <SplitLayout
          storageKey={`graphql_layout::${wsId}`}
          defaultRatio={1 / 3}
          firstSlot={requestResponseSplit}
          secondSlot={sidePanel}
        />
      );
    }
  }

  return requestResponseSplit({ style });
}
