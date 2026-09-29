/**
 * The test script API, declared once. The editor's completion walks this tree to offer the
 * members that follow a dot, and shows each member's documentation next to it. The runtime
 * that implements the same API is sandbox.ts; keep the two in step.
 */
export interface ApiMember {
  kind: "function" | "property" | "namespace";
  /** Signature or type, shown next to the name. */
  detail: string;
  /** Description, shown in the info panel of the completion. */
  doc?: string;
  /** Members reachable with a dot after this one. */
  members?: ApiMembers;
  /** For functions: the members reachable after calling it, so `expect(x).` continues. */
  returns?: ApiMembers;
  /** Text inserted instead of the bare name, in CodeMirror snippet syntax (`#{}` = cursor). */
  snippet?: string;
  /** Sort weight; higher shows first. */
  boost?: number;
}

export type ApiMembers = Record<string, ApiMember>;

const fn = (detail: string, doc: string, extra: Partial<ApiMember> = {}): ApiMember => ({
  kind: "function",
  detail,
  doc,
  ...extra,
});

const prop = (detail: string, doc: string, extra: Partial<ApiMember> = {}): ApiMember => ({
  kind: "property",
  detail,
  doc,
  ...extra,
});

const ns = (detail: string, doc: string, members: ApiMembers, boost?: number): ApiMember => ({
  kind: "namespace",
  detail,
  doc,
  members,
  boost,
});

/** Chai's BDD assertion chain. Every member returns the chain again. */
export const CHAI_ASSERTION: ApiMembers = {};

const chainWords: [string, string][] = [
  ["to", "Chain word, no effect"],
  ["be", "Chain word, no effect"],
  ["been", "Chain word, no effect"],
  ["is", "Chain word, no effect"],
  ["that", "Chain word, no effect"],
  ["which", "Chain word, no effect"],
  ["and", "Chain word, no effect"],
  ["has", "Chain word, no effect"],
  ["have", "Chain word, no effect"],
  ["with", "Chain word, no effect"],
  ["at", "Chain word, no effect"],
  ["of", "Chain word, no effect"],
  ["same", "Chain word, no effect"],
  ["but", "Chain word, no effect"],
  ["does", "Chain word, no effect"],
  ["still", "Chain word, no effect"],
  ["also", "Chain word, no effect"],
  ["not", "Negates every assertion that follows"],
  ["deep", "Deep equality for equal, include, members, property and keys"],
  ["nested", "Dotted paths in property and include, like 'a.b[0].c'"],
  ["own", "Own properties only, for property and include"],
  ["ordered", "Members must appear in the same order"],
  ["any", "keys: at least one of the given keys"],
  ["all", "keys: all of the given keys (default)"],
  ["itself", "For respondTo: check the function itself, not its prototype"],
];

const terminals: [string, string][] = [
  ["ok", "Truthy"],
  ["true", "Strictly true"],
  ["false", "Strictly false"],
  ["null", "Strictly null"],
  ["undefined", "Strictly undefined"],
  ["NaN", "Is NaN"],
  ["exist", "Neither null nor undefined"],
  ["empty", "Empty string, array, object, Map or Set"],
  ["arguments", "Is an arguments object"],
  ["extensible", "Object is extensible"],
  ["sealed", "Object is sealed"],
  ["frozen", "Object is frozen"],
  ["finite", "Finite number"],
];

const methods: [string, string, string][] = [
  ["equal", "equal(expected, message?)", "Strict equality (===); use .deep.equal for structures"],
  ["equals", "equals(expected, message?)", "Alias of equal"],
  ["eq", "eq(expected, message?)", "Alias of equal"],
  ["eql", "eql(expected, message?)", "Deep equality"],
  ["a", "a(type, message?)", "Type check: 'string', 'number', 'array', 'object', 'null', ..."],
  ["an", "an(type, message?)", "Alias of a"],
  [
    "include",
    "include(value, message?)",
    "Substring, array member, subset of object, or Set/Map member",
  ],
  ["includes", "includes(value, message?)", "Alias of include"],
  ["contain", "contain(value, message?)", "Alias of include"],
  ["contains", "contains(value, message?)", "Alias of include"],
  ["above", "above(n, message?)", "Greater than n (or length above n after .lengthOf)"],
  ["gt", "gt(n, message?)", "Alias of above"],
  ["greaterThan", "greaterThan(n, message?)", "Alias of above"],
  ["least", "least(n, message?)", "Greater than or equal to n"],
  ["gte", "gte(n, message?)", "Alias of least"],
  ["below", "below(n, message?)", "Less than n"],
  ["lt", "lt(n, message?)", "Alias of below"],
  ["lessThan", "lessThan(n, message?)", "Alias of below"],
  ["most", "most(n, message?)", "Less than or equal to n"],
  ["lte", "lte(n, message?)", "Alias of most"],
  ["within", "within(start, finish, message?)", "Between start and finish, inclusive"],
  ["instanceOf", "instanceOf(constructor, message?)", "instanceof check"],
  ["instanceof", "instanceof(constructor, message?)", "Alias of instanceOf"],
  ["property", "property(name, value?, message?)", "Has the property, optionally with the value"],
  ["ownProperty", "ownProperty(name, value?, message?)", "Has the own property"],
  [
    "ownPropertyDescriptor",
    "ownPropertyDescriptor(name, descriptor?)",
    "Has the own property descriptor",
  ],
  ["lengthOf", "lengthOf(n, message?)", "Length or size is n; chain .above/.below for ranges"],
  ["length", "length(n, message?)", "Alias of lengthOf"],
  ["match", "match(regexp, message?)", "String matches the regular expression"],
  ["matches", "matches(regexp, message?)", "Alias of match"],
  ["string", "string(substring, message?)", "String contains the substring"],
  ["keys", "keys(...keys)", "Object, Map or Set has exactly these keys (see .any/.all/.include)"],
  ["key", "key(...keys)", "Alias of keys"],
  [
    "throw",
    "throw(errorLike?, errMsgMatcher?, message?)",
    "Function throws, optionally the given error or message",
  ],
  ["throws", "throws(errorLike?, errMsgMatcher?, message?)", "Alias of throw"],
  ["respondTo", "respondTo(method, message?)", "Object or class has the method"],
  ["satisfy", "satisfy(predicate, message?)", "predicate(value) returns truthy"],
  ["closeTo", "closeTo(expected, delta, message?)", "Within delta of expected"],
  ["approximately", "approximately(expected, delta, message?)", "Alias of closeTo"],
  ["members", "members(set, message?)", "Same members as set (see .ordered/.include/.deep)"],
  ["oneOf", "oneOf(list, message?)", "Value is one of the list"],
  ["change", "change(object, property?)", "Function changes the value"],
  ["increase", "increase(object, property?)", "Function increases the value"],
  ["decrease", "decrease(object, property?)", "Function decreases the value"],
  ["by", "by(delta, message?)", "After change/increase/decrease: by exactly delta"],
];

for (const [name, doc] of chainWords) {
  CHAI_ASSERTION[name] = prop("chain", doc, { returns: CHAI_ASSERTION, members: CHAI_ASSERTION });
}
for (const [name, doc] of terminals) {
  CHAI_ASSERTION[name] = prop("assertion", doc, { members: CHAI_ASSERTION });
}
for (const [name, detail, doc] of methods) {
  CHAI_ASSERTION[name] = fn(detail, doc, { returns: CHAI_ASSERTION });
}

const expectFn = fn(
  "expect(value, message?)",
  "Chai's expect. The message is shown when it fails.",
  {
    returns: CHAI_ASSERTION,
    members: {
      fail: fn("fail(message?)", "Fail immediately", { snippet: 'fail("#{}")' }),
    },
    boost: 90,
  },
);

const testFn = fn("test(name, fn)", "One named test. It passes unless fn throws.", {
  snippet: 'test("#{name}", () => {\n\t#{}\n});',
  members: {
    skip: fn("skip(name, fn)", "Register the test as skipped without running it", {
      snippet: 'skip("#{name}", () => {\n\t#{}\n});',
    }),
  },
  boost: 100,
});

const headersMembers: ApiMembers = {
  get: fn("get(name)", "Header value, case-insensitive; undefined when absent", {
    snippet: 'get("#{}")',
  }),
  has: fn("has(name)", "Whether the header is present", { snippet: 'has("#{}")' }),
  toObject: fn("toObject()", "All headers as an object, names lower-cased", {
    snippet: "toObject()",
  }),
  all: fn("all()", "All headers as [{ key, value }]", { snippet: "all()" }),
};

/** `pm.response.to`, Postman's response assertions. `not` negates. */
const RESPONSE_ASSERTION: ApiMembers = {
  have: ns("assertions", "Assertions on parts of the response", {
    status: fn("status(code | text)", "Status code, or status text like 'OK'", {
      snippet: "status(#{200})",
    }),
    header: fn("header(name, value?)", "Header is present, optionally with the value", {
      snippet: 'header("#{}")',
    }),
    body: fn("body(text | regexp?)", "Body equals the text or matches the expression", {
      snippet: 'body("#{}")',
    }),
    jsonBody: fn(
      "jsonBody(path?, value?)",
      "Body is JSON; has the dotted path, optionally with the value",
      {
        snippet: 'jsonBody("#{}")',
      },
    ),
    jsonSchema: fn("jsonSchema(schema, options?)", "JSON body matches the JSON Schema (Ajv)", {
      snippet: "jsonSchema(#{schema})",
    }),
  }),
  be: ns("assertions", "Assertions on the response as a whole", {
    ok: prop("assertion", "Status 200 to 299"),
    success: prop("assertion", "Status 200 to 299"),
    accepted: prop("assertion", "Status 202"),
    redirection: prop("assertion", "Status 300 to 399"),
    badRequest: prop("assertion", "Status 400"),
    unauthorized: prop("assertion", "Status 401"),
    forbidden: prop("assertion", "Status 403"),
    notFound: prop("assertion", "Status 404"),
    rateLimited: prop("assertion", "Status 429"),
    clientError: prop("assertion", "Status 400 to 499"),
    serverError: prop("assertion", "Status 500 to 599"),
    error: prop("assertion", "Status 400 or higher"),
    info: prop("assertion", "Status 100 to 199"),
    json: prop("assertion", "Body parses as JSON"),
    withBody: prop("assertion", "Body is not empty"),
  }),
};
RESPONSE_ASSERTION.not = prop("chain", "Negates the assertion that follows", {
  members: RESPONSE_ASSERTION,
});

const scopeMembers = (what: string): ApiMembers => ({
  get: fn("get(name)", `Value of the ${what} variable, undefined when unset`, {
    snippet: 'get("#{}")',
  }),
  set: fn("set(name, value)", `Set the ${what} variable; saved when the script ends`, {
    snippet: 'set("#{name}", #{value})',
  }),
  unset: fn("unset(name)", `Remove the ${what} variable`, { snippet: 'unset("#{}")' }),
  has: fn("has(name)", `Whether the ${what} variable exists`, { snippet: 'has("#{}")' }),
  clear: fn("clear()", `Remove every ${what} variable`, { snippet: "clear()" }),
  toObject: fn("toObject()", `All ${what} variables as an object`, { snippet: "toObject()" }),
  replaceIn: fn("replaceIn(text)", "Replace {{name}} placeholders in the text", {
    snippet: 'replaceIn("#{}")',
  }),
});

const environmentMembers: ApiMembers = {
  ...scopeMembers("environment"),
  name: prop("string | null", "Name of the environment that receives writes"),
};

export const PM: ApiMembers = {
  test: testFn,
  expect: expectFn,
  response: ns(
    "response",
    "The response this script runs against",
    {
      code: prop("number", "Status code", { boost: 10 }),
      status: prop("string", "Status text, like 'OK'"),
      responseTime: prop("number", "Round trip in milliseconds"),
      responseSize: prop("number", "Body size in bytes"),
      headers: ns("headers", "Response headers", headersMembers),
      json: fn("json()", "Body parsed as JSON; throws when it is not JSON", {
        snippet: "json()",
        boost: 10,
      }),
      text: fn("text()", "Raw body", { snippet: "text()" }),
      to: ns("assertions", "Postman's response assertions", RESPONSE_ASSERTION, 10),
    },
    80,
  ),
  request: ns("request", "The request that was sent", {
    id: prop("string", "Request id"),
    name: prop("string", "Request name"),
    url: prop("string", "Request URL as sent"),
    method: prop("string", "HTTP method"),
    headers: ns("headers", "Request headers", headersMembers),
  }),
  environment: ns(
    "scope",
    "The active environment. Without one, the workspace's base environment.",
    environmentMembers,
    70,
  ),
  collectionVariables: ns(
    "scope",
    "The workspace's base environment (Postman's collection variables)",
    scopeMembers("collection"),
  ),
  globals: ns(
    "scope",
    "The workspace's base environment (Postman's globals)",
    scopeMembers("global"),
  ),
  variables: ns("scope", "Every variable visible to the request, most specific scope first", {
    get: fn("get(name)", "Resolved value: folder, then environment, then base", {
      snippet: 'get("#{}")',
    }),
    set: fn("set(name, value)", "Set a local variable for this script run only", {
      snippet: 'set("#{name}", #{value})',
    }),
    has: fn("has(name)", "Whether any scope defines the variable", { snippet: 'has("#{}")' }),
    replaceIn: fn("replaceIn(text)", "Replace {{name}} placeholders in the text", {
      snippet: 'replaceIn("#{}")',
    }),
    toObject: fn("toObject()", "All resolved variables as an object", { snippet: "toObject()" }),
  }),
  info: ns("info", "About this run", {
    eventName: prop("'test'", "Always 'test' here"),
    requestName: prop("string", "Request name"),
    requestId: prop("string", "Request id"),
    iteration: prop("number", "Always 0"),
    iterationCount: prop("number", "Always 1"),
  }),
};

/** What a script sees as globals. */
export const GLOBALS: ApiMembers = {
  pm: ns("Postman API", "Postman's pm object: tests, expect, response, variables", PM, 100),
  test: testFn,
  expect: expectFn,
  assert: ns("chai.assert", "Chai's assert style: assert.equal(actual, expected, message?)", {
    equal: fn("equal(actual, expected, message?)", "Loose equality"),
    strictEqual: fn("strictEqual(actual, expected, message?)", "Strict equality"),
    deepEqual: fn("deepEqual(actual, expected, message?)", "Deep equality"),
    notEqual: fn("notEqual(actual, expected, message?)", "Not loosely equal"),
    isTrue: fn("isTrue(value, message?)", "Strictly true"),
    isFalse: fn("isFalse(value, message?)", "Strictly false"),
    isOk: fn("isOk(value, message?)", "Truthy"),
    isNotOk: fn("isNotOk(value, message?)", "Falsy"),
    exists: fn("exists(value, message?)", "Neither null nor undefined"),
    isDefined: fn("isDefined(value, message?)", "Not undefined"),
    isUndefined: fn("isUndefined(value, message?)", "Undefined"),
    isNull: fn("isNull(value, message?)", "Null"),
    isArray: fn("isArray(value, message?)", "Is an array"),
    isString: fn("isString(value, message?)", "Is a string"),
    isNumber: fn("isNumber(value, message?)", "Is a number"),
    isObject: fn("isObject(value, message?)", "Is an object"),
    include: fn("include(haystack, needle, message?)", "Contains"),
    match: fn("match(value, regexp, message?)", "Matches"),
    lengthOf: fn("lengthOf(value, length, message?)", "Has the length"),
    property: fn("property(object, name, message?)", "Has the property"),
    fail: fn("fail(message?)", "Fail immediately"),
  }),
  json: prop("any", "Body parsed as JSON, undefined when it is not JSON", { boost: 60 }),
  body: prop("string", "Raw response body"),
  status: prop("number", "Status code", { boost: 50 }),
  statusText: prop("string", "Status text, like 'OK'"),
  headers: prop("Record<string, string>", "Response headers, names lower-cased"),
  elapsed: prop("number", "Round trip in milliseconds"),
  response: prop("HttpResponse", "Yaak's raw response record"),
  console: ns("console", "Output lands in the Tests tab, not the devtools", {
    log: fn("log(...values)", "Log a line", { snippet: "log(#{})" }),
    info: fn("info(...values)", "Log a line", { snippet: "info(#{})" }),
    warn: fn("warn(...values)", "Log a warning", { snippet: "warn(#{})" }),
    error: fn("error(...values)", "Log an error", { snippet: "error(#{})" }),
  }),
  require: fn("require(name)", "Bundled modules: 'chai', 'ajv'", { snippet: 'require("#{}")' }),
  tests: prop("Record<string, boolean>", "Legacy Postman results object: tests['name'] = ok"),
  responseBody: prop("string", "Legacy Postman: raw body"),
  responseCode: prop("{ code, name }", "Legacy Postman: status code and text"),
  postman: ns("legacy", "Legacy Postman API", {
    setEnvironmentVariable: fn("setEnvironmentVariable(name, value)", "Same as pm.environment.set"),
    getEnvironmentVariable: fn("getEnvironmentVariable(name)", "Same as pm.environment.get"),
    clearEnvironmentVariable: fn("clearEnvironmentVariable(name)", "Same as pm.environment.unset"),
    setGlobalVariable: fn("setGlobalVariable(name, value)", "Same as pm.globals.set"),
    getGlobalVariable: fn("getGlobalVariable(name)", "Same as pm.globals.get"),
    clearGlobalVariable: fn("clearGlobalVariable(name)", "Same as pm.globals.unset"),
  }),
};
