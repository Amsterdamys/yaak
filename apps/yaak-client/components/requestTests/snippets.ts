import type { EditorView } from "@codemirror/view";

export interface Snippet {
  title: string;
  code: string;
  group: "Postman" | "Yaak";
}

/** Postman's snippet panel, plus a few for the GraphQL APIs this workspace talks to. */
export const SNIPPETS: Snippet[] = [
  {
    group: "Postman",
    title: "Status code: Code is 200",
    code: 'pm.test("Status code is 200", () => {\n  pm.response.to.have.status(200);\n});',
  },
  {
    group: "Postman",
    title: "Status code: Successful POST request",
    code: 'pm.test("Successful POST request", () => {\n  pm.expect(pm.response.code).to.be.oneOf([201, 202]);\n});',
  },
  {
    group: "Postman",
    title: "Status code: Code name has string",
    code: 'pm.test("Status code name has string", () => {\n  pm.response.to.have.status("Created");\n});',
  },
  {
    group: "Postman",
    title: "Response body: Contains string",
    code: 'pm.test("Body matches string", () => {\n  pm.expect(pm.response.text()).to.include("string_you_want_to_search");\n});',
  },
  {
    group: "Postman",
    title: "Response body: Is equal to a string",
    code: 'pm.test("Body is correct", () => {\n  pm.response.to.have.body("response_body_string");\n});',
  },
  {
    group: "Postman",
    title: "Response body: JSON value check",
    code: 'pm.test("Your test name", () => {\n  const jsonData = pm.response.json();\n  pm.expect(jsonData.value).to.eql(100);\n});',
  },
  {
    group: "Postman",
    title: "Response headers: Content-Type header check",
    code: 'pm.test("Content-Type is present", () => {\n  pm.response.to.have.header("Content-Type");\n});',
  },
  {
    group: "Postman",
    title: "Response time is less than 200ms",
    code: 'pm.test("Response time is less than 200ms", () => {\n  pm.expect(pm.response.responseTime).to.be.below(200);\n});',
  },
  {
    group: "Postman",
    title: "Use JSON schema validation",
    code: 'const schema = {\n  type: "object",\n  required: ["id"],\n  properties: {\n    id: { type: "number" },\n  },\n};\n\npm.test("Schema is valid", () => {\n  pm.response.to.have.jsonSchema(schema);\n});',
  },
  {
    group: "Postman",
    title: "Get an environment variable",
    code: 'pm.environment.get("variable_key");',
  },
  {
    group: "Postman",
    title: "Set an environment variable",
    code: 'pm.environment.set("variable_key", "variable_value");',
  },
  {
    group: "Postman",
    title: "Clear an environment variable",
    code: 'pm.environment.unset("variable_key");',
  },
  {
    group: "Postman",
    title: "Get a collection variable",
    code: 'pm.collectionVariables.get("variable_key");',
  },
  {
    group: "Postman",
    title: "Set a collection variable",
    code: 'pm.collectionVariables.set("variable_key", "variable_value");',
  },
  {
    group: "Postman",
    title: "Clear a collection variable",
    code: 'pm.collectionVariables.unset("variable_key");',
  },
  {
    group: "Postman",
    title: "Get a variable",
    code: 'pm.variables.get("variable_key");',
  },
  {
    group: "Yaak",
    title: "GraphQL: No errors in the response",
    code: 'pm.test("No GraphQL errors", () => {\n  const { errors } = pm.response.json();\n  pm.expect(errors, JSON.stringify(errors)).to.be.undefined;\n});',
  },
  {
    group: "Yaak",
    title: "GraphQL: Data field is present",
    code: 'pm.test("data.field is present", () => {\n  pm.expect(pm.response.json()).to.have.nested.property("data.field");\n});',
  },
  {
    group: "Yaak",
    title: "Save a response value into the environment",
    code: 'const token = pm.response.json().token;\npm.environment.set("TOKEN", token);',
  },
  {
    group: "Yaak",
    title: "Log a value to the Tests tab",
    code: "console.log(pm.response.json());",
  },
];

/**
 * Insert a snippet at the cursor, the way Postman does: on its own line, replacing any
 * selection, with the cursor after it.
 */
export function insertSnippet(view: EditorView, code: string) {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = line.text.slice(0, from - line.from).trim() === "" ? "" : "\n";
  const insert = `${prefix}${code}\n`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}
