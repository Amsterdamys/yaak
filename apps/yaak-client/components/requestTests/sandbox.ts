/**
 * The test script runtime: Postman's `pm` object on top of Chai, plus a few shorthand
 * globals. Pure: it takes the response and the variables as data and returns results and
 * the variable writes to apply, so it runs the same in a Web Worker and in unit tests. The
 * API it exposes is declared for the editor in api.ts; keep the two in step.
 */
import Ajv from "ajv";
import { AssertionError, assert as chaiAssert, expect as chaiExpect } from "chai";

export interface SandboxHeader {
  name: string;
  value: string;
}

export interface SandboxResponse {
  status: number;
  statusReason: string;
  headers: SandboxHeader[];
  body: string;
  elapsed: number;
  url: string;
  contentLength: number | null;
}

export interface SandboxRequest {
  id: string;
  name: string;
  url: string;
  method: string;
  headers: SandboxHeader[];
}

export interface SandboxVariables {
  /** Name of the environment `pm.environment` reads and writes, null when there is none. */
  environmentName: string | null;
  environment: Record<string, string>;
  /** The workspace's base environment: Postman's collection variables and globals. */
  collection: Record<string, string>;
  /** Every variable the request sees: folders first, then the environment, then the base. */
  resolved: Record<string, string>;
}

export interface SandboxInput {
  script: string;
  response: SandboxResponse;
  request: SandboxRequest;
  variables: SandboxVariables;
}

export type TestStatus = "passed" | "failed" | "skipped";

export interface TestResult {
  name: string;
  status: TestStatus;
  error: string | null;
}

export interface LogLine {
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
}

export type VariableScope = "environment" | "collection";

export interface VariableUpdate {
  scope: VariableScope;
  name: string;
  /** null removes the variable */
  value: string | null;
}

export interface SandboxOutcome {
  results: TestResult[];
  logs: LogLine[];
  variableUpdates: VariableUpdate[];
  /** An error thrown outside any test, which stops the script where it happened. */
  error: string | null;
  durationMs: number;
}

const MAX_LOG_LINES = 200;
const MAX_LOG_LENGTH = 4000;

const AsyncFunction = Object.getPrototypeOf(async function () {
  /* only here for its constructor */
}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

export async function runTestScript(input: SandboxInput): Promise<SandboxOutcome> {
  const started = now();
  const logs: LogLine[] = [];
  const variableUpdates: VariableUpdate[] = [];
  const recorder = new ResultRecorder();
  const scopes = createScopes(input.variables, variableUpdates);
  const response = createResponse(input.response);
  const legacyTests: Record<string, unknown> = {};
  const pm = createPm(input, recorder, scopes, response);

  const globals: Record<string, unknown> = {
    pm,
    test: pm.test,
    expect: pm.expect,
    assert: chaiAssert,
    json: response.jsonOrUndefined(),
    body: input.response.body,
    status: input.response.status,
    statusText: input.response.statusReason,
    headers: response.headerMap,
    elapsed: input.response.elapsed,
    response: input.response,
    console: createConsole(logs),
    tests: legacyTests,
    responseBody: input.response.body,
    responseCode: {
      code: input.response.status,
      name: input.response.statusReason,
      detail: `${input.response.status} ${input.response.statusReason}`.trim(),
    },
    postman: createLegacyPostman(scopes),
    require: requireModule,
  };

  let error: string | null = null;
  try {
    const fn = new AsyncFunction(...Object.keys(globals), input.script);
    await fn(...Object.values(globals));
  } catch (err) {
    error = describeError(err);
  }
  await recorder.settle();

  for (const [name, value] of Object.entries(legacyTests)) {
    recorder.results.push({
      name,
      status: value ? "passed" : "failed",
      error: value ? null : `tests["${name}"] is ${String(value)}`,
    });
  }

  return {
    results: recorder.results,
    logs,
    variableUpdates,
    error,
    durationMs: Math.round(now() - started),
  };
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const named = err.name !== "" && err.name !== "Error" && err.name !== "AssertionError";
    return named ? `${err.name}: ${err.message}` : err.message;
  }
  return String(err);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value != null && typeof (value as PromiseLike<unknown>).then === "function";
}

/**
 * Tests are recorded in the order they are declared: a test runs when `pm.test` is called,
 * and one that returns a promise fills in its result later without moving in the list.
 */
class ResultRecorder {
  results: TestResult[] = [];
  private pending: Promise<void>[] = [];

  register(name: unknown, fn: unknown, skip: boolean) {
    const result: TestResult = { name: String(name), status: "passed", error: null };
    this.results.push(result);

    if (skip) {
      result.status = "skipped";
      return;
    }
    if (typeof fn !== "function") {
      result.status = "failed";
      result.error = "pm.test needs a function as its second argument";
      return;
    }

    try {
      const returned = (fn as () => unknown)();
      if (isPromiseLike(returned)) {
        this.pending.push(
          Promise.resolve(returned).then(
            () => undefined,
            (err) => {
              result.status = "failed";
              result.error = describeError(err);
            },
          ),
        );
      }
    } catch (err) {
      result.status = "failed";
      result.error = describeError(err);
    }
  }

  async settle() {
    await Promise.all(this.pending);
  }
}

function stringifyVariable(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "function" || typeof value === "symbol") return value.toString();
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

interface Stores {
  environment: Record<string, string>;
  collection: Record<string, string>;
  resolved: Record<string, string>;
  locals: Record<string, string>;
}

export interface ScopeApi {
  get(name: string): string | undefined;
  set(name: string, value: unknown): void;
  unset(name: string): void;
  has(name: string): boolean;
  clear(): void;
  toObject(): Record<string, string>;
  replaceIn(text: string): string;
}

interface Scopes {
  environment: ScopeApi & { name: string | null };
  collection: ScopeApi;
  variables: Omit<ScopeApi, "unset" | "clear">;
}

function replacePlaceholders(text: string, lookup: (name: string) => string | undefined): string {
  return String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name: string) => {
    const value = lookup(name);
    return value === undefined ? match : value;
  });
}

function createScopes(variables: SandboxVariables, updates: VariableUpdate[]): Scopes {
  const stores: Stores = {
    environment: { ...variables.environment },
    collection: { ...variables.collection },
    resolved: { ...variables.resolved },
    locals: {},
  };

  const record = (scope: VariableScope, name: string, value: string | null) => {
    const index = updates.findIndex((u) => u.scope === scope && u.name === name);
    if (index >= 0) updates.splice(index, 1);
    updates.push({ scope, name, value });
  };

  const resolve = (name: string): string | undefined =>
    stores.locals[name] ?? stores.resolved[name];

  const scopeApi = (scope: VariableScope): ScopeApi => {
    const store = stores[scope];
    const api: ScopeApi = {
      get: (name) => store[String(name)],
      set: (name, value) => {
        const key = String(name);
        const text = stringifyVariable(value);
        store[key] = text;
        // The environment shadows the base, so a base write only shows through when the
        // environment does not define the name.
        if (scope === "environment" || !(key in stores.environment)) stores.resolved[key] = text;
        record(scope, key, text);
      },
      unset: (name) => {
        const key = String(name);
        delete store[key];
        if (scope === "environment") {
          if (key in stores.collection) stores.resolved[key] = stores.collection[key] as string;
          else delete stores.resolved[key];
        } else if (!(key in stores.environment)) {
          delete stores.resolved[key];
        }
        record(scope, key, null);
      },
      has: (name) => Object.hasOwn(store, String(name)),
      clear: () => {
        for (const key of Object.keys(store)) api.unset(key);
      },
      toObject: () => ({ ...store }),
      replaceIn: (text) => replacePlaceholders(text, resolve),
    };
    return api;
  };

  return {
    environment: Object.assign(scopeApi("environment"), { name: variables.environmentName }),
    collection: scopeApi("collection"),
    variables: {
      get: (name) => resolve(String(name)),
      set: (name, value) => {
        stores.locals[String(name)] = stringifyVariable(value);
      },
      has: (name) => resolve(String(name)) !== undefined,
      toObject: () => ({ ...stores.resolved, ...stores.locals }),
      replaceIn: (text) => replacePlaceholders(text, resolve),
    },
  };
}

interface ResponseView {
  code: number;
  status: string;
  responseTime: number;
  responseSize: number;
  body: string;
  headerMap: Record<string, string>;
  headers: HeaderList;
  text(): string;
  json(): unknown;
  jsonOrUndefined(): unknown;
  readonly to: ResponseAssertions;
}

interface HeaderList {
  get(name: string): string | undefined;
  has(name: string): boolean;
  toObject(): Record<string, string>;
  all(): { key: string; value: string }[];
}

function createHeaderList(headers: SandboxHeader[]): {
  map: Record<string, string>;
  list: HeaderList;
} {
  const map: Record<string, string> = {};
  for (const h of headers) map[h.name.toLowerCase()] = h.value;
  return {
    map,
    list: {
      get: (name) => map[String(name).toLowerCase()],
      has: (name) => String(name).toLowerCase() in map,
      toObject: () => ({ ...map }),
      all: () => headers.map((h) => ({ key: h.name, value: h.value })),
    },
  };
}

function createResponse(raw: SandboxResponse): ResponseView {
  const { map, list } = createHeaderList(raw.headers);
  let parsed: { ok: true; value: unknown } | { ok: false; error: string } | null = null;
  const parse = () => {
    if (parsed == null) {
      try {
        parsed = { ok: true, value: JSON.parse(raw.body) };
      } catch (err) {
        parsed = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return parsed;
  };

  const view: ResponseView = {
    code: raw.status,
    status: raw.statusReason,
    responseTime: raw.elapsed,
    responseSize: raw.contentLength ?? new TextEncoder().encode(raw.body).length,
    body: raw.body,
    headerMap: map,
    headers: list,
    text: () => raw.body,
    json: () => {
      const p = parse();
      if (!p.ok) throw new Error(`response body is not valid JSON: ${p.error}`);
      return p.value;
    },
    jsonOrUndefined: () => {
      const p = parse();
      return p.ok ? p.value : undefined;
    },
    get to() {
      return responseAssertions(view, false);
    },
  };
  return view;
}

interface ResponseAssertions {
  readonly not: ResponseAssertions;
  have: {
    status(expected: number | string): void;
    header(name: string, value?: string): void;
    body(expected?: string | RegExp): void;
    jsonBody(path?: string, value?: unknown): void;
    jsonSchema(schema: object, options?: object): void;
  };
  be: Record<string, void>;
}

function responseAssertions(res: ResponseView, negated: boolean): ResponseAssertions {
  const exp = (value: unknown, message: string) =>
    negated ? chaiExpect(value, message).not : chaiExpect(value, message);
  const check = (condition: boolean, description: string) => {
    if (condition === negated) {
      throw new AssertionError(
        `expected response ${negated ? "not " : ""}to ${description}, got status ${res.code}`,
      );
    }
  };
  const statusIs = (description: string, test: (code: number) => boolean) => ({
    get: () => check(test(res.code), description),
    enumerable: true,
  });

  const be = Object.defineProperties(
    {},
    {
      ok: statusIs("be ok (2xx)", (c) => c >= 200 && c < 300),
      success: statusIs("be successful (2xx)", (c) => c >= 200 && c < 300),
      accepted: statusIs("be accepted (202)", (c) => c === 202),
      redirection: statusIs("be a redirection (3xx)", (c) => c >= 300 && c < 400),
      badRequest: statusIs("be a bad request (400)", (c) => c === 400),
      unauthorized: statusIs("be unauthorized (401)", (c) => c === 401),
      forbidden: statusIs("be forbidden (403)", (c) => c === 403),
      notFound: statusIs("be not found (404)", (c) => c === 404),
      rateLimited: statusIs("be rate limited (429)", (c) => c === 429),
      clientError: statusIs("be a client error (4xx)", (c) => c >= 400 && c < 500),
      serverError: statusIs("be a server error (5xx)", (c) => c >= 500 && c < 600),
      error: statusIs("be an error (4xx or 5xx)", (c) => c >= 400),
      info: statusIs("be informational (1xx)", (c) => c >= 100 && c < 200),
      json: {
        get: () =>
          check(res.jsonOrUndefined() !== undefined || res.body === "null", "have a JSON body"),
        enumerable: true,
      },
      withBody: { get: () => check(res.body !== "", "have a body"), enumerable: true },
    },
  ) as Record<string, void>;

  return {
    get not() {
      return responseAssertions(res, !negated);
    },
    have: {
      status(expected) {
        if (typeof expected === "number") {
          exp(res.code, "response status code").to.equal(expected);
        } else {
          exp(res.status, "response status text").to.equal(String(expected));
        }
      },
      header(name, value) {
        const key = String(name).toLowerCase();
        if (value === undefined) exp(res.headerMap, "response headers").to.have.property(key);
        else exp(res.headerMap, "response headers").to.have.property(key, value);
      },
      body(expected) {
        if (expected === undefined) check(res.body !== "", "have a body");
        else if (expected instanceof RegExp) exp(res.body, "response body").to.match(expected);
        else exp(res.body, "response body").to.equal(String(expected));
      },
      jsonBody(path, value) {
        const data = res.json();
        if (path === undefined) return;
        if (value === undefined) exp(data, "response json").to.have.nested.property(path);
        else exp(data, "response json").to.have.nested.property(path, value);
      },
      jsonSchema(schema, options) {
        const data = res.json();
        const ajv = new Ajv({ allErrors: true, strict: false, ...options });
        const validate = ajv.compile(schema);
        const valid = validate(data) === true;
        if (valid === negated) {
          throw new AssertionError(
            negated
              ? "expected response body not to match the JSON schema"
              : `expected response body to match the JSON schema: ${ajv.errorsText(validate.errors)}`,
          );
        }
      },
    },
    be,
  };
}

const unsupported = (what: string, hint: string) => () => {
  throw new Error(`${what} is not available in Yaak. ${hint}`);
};

function createPm(
  input: SandboxInput,
  recorder: ResultRecorder,
  scopes: Scopes,
  response: ResponseView,
) {
  const request = createHeaderList(input.request.headers);

  const test = Object.assign(
    (name: unknown, fn: unknown) => {
      recorder.register(name, fn, false);
      return pm;
    },
    {
      skip: (name: unknown, fn: unknown) => {
        recorder.register(name, fn, true);
        return pm;
      },
    },
  );

  const expect = Object.assign((value: unknown, message?: string) => chaiExpect(value, message), {
    fail: (message?: string) => chaiExpect.fail(message),
  });

  const pm = {
    test,
    expect,
    response,
    request: {
      id: input.request.id,
      name: input.request.name,
      url: input.request.url,
      method: input.request.method,
      headers: request.list,
    },
    environment: scopes.environment,
    collectionVariables: scopes.collection,
    globals: scopes.collection,
    variables: scopes.variables,
    info: {
      eventName: "test",
      requestName: input.request.name,
      requestId: input.request.id,
      iteration: 0,
      iterationCount: 1,
    },
    iterationData: {
      get: () => undefined,
      has: () => false,
      toObject: () => ({}),
    },
    cookies: {
      get: unsupported(
        "pm.cookies",
        "Cookies live in Yaak's cookie jar; see the response Cookies tab.",
      ),
      has: unsupported(
        "pm.cookies",
        "Cookies live in Yaak's cookie jar; see the response Cookies tab.",
      ),
      toObject: unsupported(
        "pm.cookies",
        "Cookies live in Yaak's cookie jar; see the response Cookies tab.",
      ),
    },
    sendRequest: unsupported(
      "pm.sendRequest",
      "Chain requests with Yaak's response tag, ${[ response.body.path(...) ]}, or send them from a folder.",
    ),
    execution: {
      setNextRequest: unsupported(
        "pm.execution.setNextRequest",
        "Folder sends run in sidebar order.",
      ),
      skipRequest: unsupported("pm.execution.skipRequest", "Only post-response scripts run here."),
      location: [input.request.name],
    },
    visualizer: {
      set: unsupported("pm.visualizer", "There is no visualizer tab."),
    },
    require: unsupported(
      "pm.require",
      "Use require('chai') or require('ajv'); nothing else is bundled.",
    ),
  };

  return pm;
}

function createLegacyPostman(scopes: Scopes) {
  return {
    setEnvironmentVariable: (name: string, value: unknown) => scopes.environment.set(name, value),
    getEnvironmentVariable: (name: string) => scopes.environment.get(name),
    clearEnvironmentVariable: (name: string) => scopes.environment.unset(name),
    setGlobalVariable: (name: string, value: unknown) => scopes.collection.set(name, value),
    getGlobalVariable: (name: string) => scopes.collection.get(name),
    clearGlobalVariable: (name: string) => scopes.collection.unset(name),
    setNextRequest: unsupported("postman.setNextRequest", "Folder sends run in sidebar order."),
  };
}

function requireModule(name: string): unknown {
  switch (name) {
    case "chai":
      return { expect: chaiExpect, assert: chaiAssert, AssertionError };
    case "ajv":
      return Ajv;
    default:
      throw new Error(`Cannot require '${name}': only chai and ajv are bundled.`);
  }
}

function formatLogValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return describeError(value);
  if (value === undefined) return "undefined";
  if (typeof value === "function" || typeof value === "symbol") return value.toString();
  try {
    const text = JSON.stringify(value, null, 2);
    return text === undefined ? Object.prototype.toString.call(value) : text;
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function createConsole(logs: LogLine[]) {
  const capture =
    (level: LogLine["level"]) =>
    (...args: unknown[]) => {
      if (logs.length >= MAX_LOG_LINES) {
        if (logs.length === MAX_LOG_LINES) logs.push({ level: "warn", text: "… output truncated" });
        return;
      }
      let text = args.map(formatLogValue).join(" ");
      if (text.length > MAX_LOG_LENGTH) text = `${text.slice(0, MAX_LOG_LENGTH)}…`;
      logs.push({ level, text });
    };
  return {
    log: capture("log"),
    info: capture("info"),
    warn: capture("warn"),
    error: capture("error"),
    debug: capture("debug"),
  };
}
