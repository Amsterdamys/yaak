import { describe, expect, test } from "vite-plus/test";
import type { SandboxInput } from "./sandbox";
import { runTestScript } from "./sandbox";

function input(script: string, overrides: Partial<SandboxInput["response"]> = {}): SandboxInput {
  return {
    script,
    response: {
      status: 200,
      statusReason: "OK",
      headers: [{ name: "Content-Type", value: "application/json" }],
      body: JSON.stringify({ data: { me: { id: "1", email: "a@b.c" } }, count: 3 }),
      elapsed: 42,
      url: "https://api.example.com/graphql",
      contentLength: 60,
      ...overrides,
    },
    request: {
      id: "rq_1",
      name: "Me",
      url: "https://api.example.com/graphql",
      method: "POST",
      headers: [{ name: "Authorization", value: "Bearer x" }],
    },
    variables: {
      environmentName: "Dev",
      environment: { TOKEN: "env-token", ONLY_ENV: "1" },
      collection: { TOKEN: "base-token", API: "https://api" },
      resolved: { TOKEN: "env-token", ONLY_ENV: "1", API: "https://api", FROM_FOLDER: "f" },
    },
  };
}

describe("runTestScript", () => {
  test("records passed and failed tests in declaration order, with Chai's message", async () => {
    const out = await runTestScript(
      input(`
        pm.test("status", () => pm.response.to.have.status(200));
        pm.test("count", () => pm.expect(pm.response.json().count).to.equal(4));
        pm.test("async", async () => { await Promise.resolve(); pm.expect(1).to.equal(1); });
      `),
    );
    expect(out.error).toBeNull();
    expect(out.results.map((r) => [r.name, r.status])).toEqual([
      ["status", "passed"],
      ["count", "failed"],
      ["async", "passed"],
    ]);
    expect(out.results[1]?.error).toBe("expected 3 to equal 4");
  });

  test("pm.test.skip and legacy tests[] object", async () => {
    const out = await runTestScript(
      input(`
        pm.test.skip("later", () => { throw new Error("never runs"); });
        tests["legacy ok"] = responseCode.code === 200;
        tests["legacy bad"] = responseBody.length === 0;
      `),
    );
    expect(out.results.map((r) => [r.name, r.status])).toEqual([
      ["later", "skipped"],
      ["legacy ok", "passed"],
      ["legacy bad", "failed"],
    ]);
  });

  test("an error outside any test stops the script and is reported", async () => {
    const out = await runTestScript(
      input(`
        pm.test("first", () => {});
        const x = undefined;
        x.boom;
        pm.test("never", () => {});
      `),
    );
    expect(out.results.map((r) => r.name)).toEqual(["first"]);
    expect(out.error).toMatch(/TypeError/);
  });

  test("response assertions: headers, body, jsonBody, be.*, not, jsonSchema", async () => {
    const out = await runTestScript(
      input(`
        pm.test("header", () => pm.response.to.have.header("content-type", "application/json"));
        pm.test("header missing", () => pm.response.to.have.header("x-nope"));
        pm.test("body regex", () => pm.response.to.have.body(/"count":3/));
        pm.test("jsonBody path", () => pm.response.to.have.jsonBody("data.me.email", "a@b.c"));
        pm.test("be.ok", () => pm.response.to.be.ok);
        pm.test("not.be.error", () => pm.response.to.not.be.error);
        pm.test("be.json", () => pm.response.to.be.json);
        pm.test("not.be.ok", () => pm.response.to.not.be.ok);
        pm.test("schema ok", () => pm.response.to.have.jsonSchema({ type: "object", required: ["count"] }));
        pm.test("schema bad", () => pm.response.to.have.jsonSchema({ type: "object", properties: { count: { type: "string" } } }));
        pm.test("status text", () => pm.response.to.have.status("OK"));
      `),
    );
    const byName = Object.fromEntries(out.results.map((r) => [r.name, r]));
    expect(byName["header"]?.status).toBe("passed");
    expect(byName["header missing"]?.status).toBe("failed");
    expect(byName["body regex"]?.status).toBe("passed");
    expect(byName["jsonBody path"]?.status).toBe("passed");
    expect(byName["be.ok"]?.status).toBe("passed");
    expect(byName["not.be.error"]?.status).toBe("passed");
    expect(byName["be.json"]?.status).toBe("passed");
    expect(byName["not.be.ok"]?.status).toBe("failed");
    expect(byName["not.be.ok"]?.error).toMatch(/not to be ok/);
    expect(byName["schema ok"]?.status).toBe("passed");
    expect(byName["schema bad"]?.status).toBe("failed");
    expect(byName["schema bad"]?.error).toMatch(/must be string/);
    expect(byName["status text"]?.status).toBe("passed");
  });

  test("shorthand globals and console capture", async () => {
    const out = await runTestScript(
      input(`
        test("status", () => expect(status).to.equal(200));
        test("json", () => expect(json.data.me.id).to.equal("1"));
        test("headers", () => expect(headers["content-type"]).to.include("json"));
        console.log("count is", json.count, { a: 1 });
        console.warn(new Error("careful"));
      `),
    );
    expect(out.results.every((r) => r.status === "passed")).toBe(true);
    expect(out.logs).toEqual([
      { level: "log", text: 'count is 3 {\n  "a": 1\n}' },
      { level: "warn", text: "careful" },
    ]);
  });

  test("variables: scopes, precedence, writes and unsets", async () => {
    const out = await runTestScript(
      input(`
        pm.test("reads", () => {
          pm.expect(pm.environment.get("TOKEN")).to.equal("env-token");
          pm.expect(pm.collectionVariables.get("TOKEN")).to.equal("base-token");
          pm.expect(pm.variables.get("FROM_FOLDER")).to.equal("f");
          pm.expect(pm.environment.name).to.equal("Dev");
          pm.expect(pm.variables.replaceIn("{{API}}/x")).to.equal("https://api/x");
        });
        pm.environment.set("TOKEN", "new");
        pm.environment.set("OBJ", { a: 1 });
        pm.collectionVariables.set("API", "https://new");
        pm.collectionVariables.set("TOKEN", "base-2");
        pm.environment.unset("ONLY_ENV");
        pm.variables.set("LOCAL", 5);
        pm.test("after writes", () => {
          pm.expect(pm.variables.get("TOKEN")).to.equal("new");
          pm.expect(pm.variables.get("API")).to.equal("https://new");
          pm.expect(pm.environment.has("ONLY_ENV")).to.equal(false);
          pm.expect(pm.variables.get("LOCAL")).to.equal("5");
          pm.expect(pm.environment.get("OBJ")).to.equal('{"a":1}');
        });
        postman.setEnvironmentVariable("LEGACY", "yes");
      `),
    );
    expect(
      out.results.every((r) => r.status === "passed"),
      JSON.stringify(out.results),
    ).toBe(true);
    expect(out.variableUpdates).toEqual([
      { scope: "environment", name: "TOKEN", value: "new" },
      { scope: "environment", name: "OBJ", value: '{"a":1}' },
      { scope: "collection", name: "API", value: "https://new" },
      { scope: "collection", name: "TOKEN", value: "base-2" },
      { scope: "environment", name: "ONLY_ENV", value: null },
      { scope: "environment", name: "LEGACY", value: "yes" },
    ]);
  });

  test("unsupported Postman features fail loudly, and json() on a non-JSON body throws", async () => {
    const out = await runTestScript(
      input(
        `
        pm.test("send", () => pm.sendRequest("https://x"));
        pm.test("json", () => pm.response.json());
        pm.test("json global", () => pm.expect(json).to.be.undefined);
        pm.test("require", () => pm.expect(require("chai").expect).to.be.a("function"));
        pm.test("require other", () => require("lodash"));
      `,
        { body: "<html/>" },
      ),
    );
    const byName = Object.fromEntries(out.results.map((r) => [r.name, r]));
    expect(byName["send"]?.error).toMatch(/pm.sendRequest is not available/);
    expect(byName["json"]?.error).toMatch(/not valid JSON/);
    expect(byName["json global"]?.status).toBe("passed");
    expect(byName["require"]?.status).toBe("passed");
    expect(byName["require other"]?.error).toMatch(/only chai and ajv/);
  });

  test("pm.info, pm.request and pm.expect.fail", async () => {
    const out = await runTestScript(
      input(`
        pm.test("info", () => pm.expect(pm.info.requestName).to.equal("Me"));
        pm.test("request", () => {
          pm.expect(pm.request.method).to.equal("POST");
          pm.expect(pm.request.headers.get("authorization")).to.equal("Bearer x");
        });
        pm.test("fail", () => pm.expect.fail("nope"));
      `),
    );
    expect(out.results.map((r) => r.status)).toEqual(["passed", "passed", "failed"]);
    expect(out.results[2]?.error).toBe("nope");
  });
});
