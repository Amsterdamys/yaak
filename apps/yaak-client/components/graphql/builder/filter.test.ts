import { buildSchema } from "graphql";
import { describe, expect, test } from "vite-plus/test";
import { buildFieldFilter, parseFilterPattern } from "./filter";

const schema = buildSchema(`
  type Query { health: Int!, settings: Settings, users: [User!]! }
  type Settings { id: Int!, locale: String, owner: User }
  type User { id: Int!, email: String!, address: Address }
  type Address { city: String, zipCode: String }
  type Mutation { emailDocumentTranslate(id: Int!): Boolean }
`);

describe("parseFilterPattern", () => {
  test("empty text means no filter", () => {
    expect(parseFilterPattern("")).toBeNull();
    expect(parseFilterPattern("   ")).toBeNull();
  });

  test("plain text is a case-insensitive substring, special characters included", () => {
    const p = parseFilterPattern("Zip.Code");
    expect(p?.test("zip.code")).toBe(true);
    expect(p?.test("zipCode")).toBe(false);
    expect(parseFilterPattern("email")?.test("EmailDocumentTranslate")).toBe(true);
  });

  test("/pattern/ is a regular expression, /pattern/flags keeps its flags", () => {
    expect(parseFilterPattern("/^zip/")?.test("zipCode")).toBe(true);
    expect(parseFilterPattern("/^zip/")?.test("myZip")).toBe(false);
    expect(parseFilterPattern("/^user|^set/")?.test("settings")).toBe(true);
  });

  test("an invalid regular expression is searched literally", () => {
    expect(parseFilterPattern("/(/")?.test("a(b")).toBe(true);
  });
});

describe("buildFieldFilter", () => {
  test("marks the types that have a matching field and every type leading to them", () => {
    const f = buildFieldFilter(schema, "city");
    expect(f).not.toBeNull();
    expect(f?.test("city")).toBe(true);
    // Address has `city`; User reaches Address; Settings reaches User; Query reaches Settings.
    expect([...(f?.matchingTypes ?? [])].sort()).toEqual(["Address", "Query", "Settings", "User"]);
    expect(f?.matchingTypes.has("Mutation")).toBe(false);
  });

  test("a match on a root field marks only that root type", () => {
    const f = buildFieldFilter(schema, "emailDocument");
    expect([...(f?.matchingTypes ?? [])]).toEqual(["Mutation"]);
  });

  test("no matches gives an empty set, not null", () => {
    const f = buildFieldFilter(schema, "nothing-like-this");
    expect(f?.matchingTypes.size).toBe(0);
  });
});
