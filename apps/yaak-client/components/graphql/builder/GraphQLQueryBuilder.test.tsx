import type { HttpRequest } from "@yaakapp-internal/models";
import { buildSchema } from "graphql";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vite-plus/test";
import { GraphQLQueryBuilder } from "./GraphQLQueryBuilder";

vi.mock("@yaakapp-internal/models", () => ({ patchModel: vi.fn(() => Promise.resolve("")) }));
vi.mock("@yaakapp-internal/ui", () => ({
  // The tree renders these for checkboxes and arrows; emit the icon name so markup is assertable
  Icon: ({ icon }: { icon: string }) => <i>{`[${icon}]`}</i>,
}));
vi.mock("../../core/IconButton", () => ({
  IconButton: ({ title }: { title: string }) => <button>{title}</button>,
}));
vi.mock("../../core/PlainInput", () => ({
  PlainInput: ({ placeholder, defaultValue }: { placeholder: string; defaultValue: string }) => (
    <input placeholder={placeholder} defaultValue={defaultValue} />
  ),
}));
vi.mock("../../ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../../hooks/useRequestUpdateKey", () => ({ wasUpdatedExternally: vi.fn() }));
vi.mock("../../../lib/jotai", () => ({ jotaiStore: { set: vi.fn() } }));

const schema = buildSchema(`
  type Query { health: Int!, settings(companyId: Int!): Settings }
  type Settings { id: Int!, name: String }
  type Mutation { emailDocumentTranslate(input: TranslateInput!): Boolean }
  input TranslateInput { emailDocumentId: Int!, targetLanguageId: Int! }
`);

function request(query: string): HttpRequest {
  return {
    id: "rq_test",
    model: "http_request",
    body: { query, variables: "{}" },
    bodyType: "graphql",
  } as unknown as HttpRequest;
}

describe("GraphQLQueryBuilder", () => {
  test("shows the schema as a checkbox tree with the query's fields ticked", () => {
    const markup = renderToStaticMarkup(
      <GraphQLQueryBuilder schema={schema} request={request("query Health { health }")} />,
    );

    // Selected leaf field is checked; an unselected object field shows a collapsed arrow
    expect(markup).toMatch(/\[check_square_checked\][^[]*health/);
    expect(markup).toMatch(/\[chevron_right\][^[]*settings/);
    // A mutation can be added from the actions bar
    expect(markup).toContain('value="mutation"');
    // The operation name is editable in place
    expect(markup).toContain('value="Health"');
  });

  test("shows argument inputs for a selected field with arguments", () => {
    const markup = renderToStaticMarkup(
      <GraphQLQueryBuilder
        schema={schema}
        request={request("{ settings(companyId: 42) { id } }")}
      />,
    );

    expect(markup).toContain("companyId");
    expect(markup).toContain('value="42"');
    expect(markup).toMatch(/\[check_square_checked\][^[]*id/);
    expect(markup).toMatch(/\[check_square_unchecked\][^[]*name/);
  });

  test("shows a section for every root type, placeholders included", () => {
    const markup = renderToStaticMarkup(
      <GraphQLQueryBuilder schema={schema} request={request("query Health { health }")} />,
    );

    // The query section carries the document's operation; the mutation section is a placeholder
    expect(markup).toContain('value="Health"');
    expect(markup).toContain('placeholder="Mutation Name"');
    expect(markup).toContain("emailDocumentTranslate");
  });

  test("the filter hides non-matching rows and opens the path to a nested match", () => {
    const markup = renderToStaticMarkup(
      <GraphQLQueryBuilder
        schema={schema}
        request={request("query Health { health }")}
        defaultFilter="name"
      />,
    );

    // `settings` leads to Settings.name: shown and opened although nothing is selected
    expect(markup).toMatch(/\[chevron_down\][^[]*settings/);
    expect(markup).toMatch(/\[check_square_unchecked\][^[]*name/);
    // `health` matches nothing and is gone; Settings.id is not a match either
    expect(markup).not.toContain('data-field-name="health"');
    expect(markup).not.toContain('data-field-name="id"');
    // The mutation section has no match and shows no rows
    expect(markup).not.toContain("emailDocumentTranslate");
  });

  test("still renders when the query text does not parse", () => {
    const markup = renderToStaticMarkup(
      <GraphQLQueryBuilder schema={schema} request={request("query { health ")} />,
    );

    expect(markup).toContain("Query Builder");
    expect(markup).toContain("health");
  });
});
