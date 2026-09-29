import { javascriptLanguage } from "@codemirror/lang-javascript";
import { describe, expect, test } from "vite-plus/test";
import { GLOBALS } from "./api";
import { parseChain, resolveMembers } from "./completion";
import { SNIPPETS } from "./snippets";

describe("parseChain", () => {
  test("top level word", () => {
    expect(parseChain("const x = 1;\npm")).toEqual({ segments: [], partial: "pm", from: 13 });
  });

  test("members after dots, with and without calls", () => {
    const chain = parseChain("pm.response.to.have.st");
    expect(chain.partial).toBe("st");
    expect(chain.segments).toEqual([
      { name: "pm", called: false },
      { name: "response", called: false },
      { name: "to", called: false },
      { name: "have", called: false },
    ]);
    expect(chain.from).toBe(20);
  });

  test("calls are skipped as balanced groups, across lines", () => {
    const chain = parseChain('expect(json.data, "msg (x)")\n  .to.be.');
    expect(chain.partial).toBe("");
    expect(chain.segments).toEqual([
      { name: "expect", called: true },
      { name: "to", called: false },
      { name: "be", called: false },
    ]);
  });

  test("a chain that does not start with a name is not ours", () => {
    expect(parseChain("[1, 2].").from).toBe(-1);
    expect(parseChain('"abc".').from).toBe(-1);
  });
});

describe("resolveMembers", () => {
  const names = (text: string) => {
    const chain = parseChain(text);
    const members = resolveMembers(GLOBALS, chain.segments);
    return members == null ? null : Object.keys(members);
  };

  test("pm members", () => {
    expect(names("pm.")).toEqual(
      expect.arrayContaining(["test", "expect", "response", "environment"]),
    );
  });

  test("response assertions and negation", () => {
    expect(names("pm.response.to.have.")).toEqual(
      expect.arrayContaining(["status", "header", "jsonBody", "jsonSchema"]),
    );
    expect(names("pm.response.to.not.be.")).toEqual(
      expect.arrayContaining(["ok", "error", "json"]),
    );
  });

  test("chai chain after expect(...) and after a matcher call", () => {
    expect(names("expect(x).to.be.")).toEqual(
      expect.arrayContaining(["equal", "above", "ok", "not"]),
    );
    expect(names("pm.expect(x).to.have.lengthOf(2).and.")).toEqual(
      expect.arrayContaining(["equal"]),
    );
    expect(names("expect(x).deep.")).toEqual(expect.arrayContaining(["equal", "include"]));
  });

  test("outside the declared API there is nothing to offer", () => {
    expect(names("pm.response.json().")).toBeNull();
    expect(names("foo.bar.")).toBeNull();
    expect(names("pm.test.")).toEqual(["skip"]);
  });
});

describe("snippets", () => {
  test("every snippet parses as JavaScript", () => {
    for (const s of SNIPPETS) {
      let errors = 0;
      javascriptLanguage.parser.parse(s.code).iterate({
        enter: (node) => {
          if (node.type.isError) errors++;
        },
      });
      expect(errors, s.title).toBe(0);
    }
  });
});
