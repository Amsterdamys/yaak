# Shaman fork of Yaak

This fork adds what our developers miss in stock Yaak and stays on top of upstream releases.

## Branches

| Branch   | Content                                                                 | Rule                        |
| -------- | ----------------------------------------------------------------------- | --------------------------- |
| `main`   | Pure mirror of `mountain-loop/yaak` `main`. Never edited here.          | Fast-forward only.          |
| `shaman` | The newest upstream stable tag plus our commits. Builds ship from here. | Merges only, no force-push. |

Our whole difference from upstream is `git diff <upstream-tag> shaman`.

Taking a new upstream release: fast-forward `main`, then merge the release tag into `shaman`
through a `sync/<tag>` branch and a pull request. A clean merge is merged as is; a conflict is
resolved on that branch by hand. The touched upstream files are kept few and small on purpose,
so conflicts are rare (see each feature below for the list).

```shell
git fetch upstream --tags
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout -b sync/v2026.9.0 shaman && git merge v2026.9.0   # resolve if needed
git push -u origin sync/v2026.9.0                               # open PR into shaman
```

## Development

Everything in `DEVELOPMENT.md` applies. Two things to know on a Mac without Homebrew LLVM:

- `npm run bootstrap` fails in `crates/yaak-wasm` because `wasm-pack` needs a clang with a
  WebAssembly backend. The wasm packages are committed, so run
  `SKIP_WASM_BUILD=1 npm run bootstrap` instead.
- Rust comes from `rustup`, not `brew install rust`.

`npm start` runs the desktop app with hot reload for the TypeScript side; the Rust shell
compiles once (10 to 20 minutes) and is cached after that.

### The browser edition's WebAssembly package

`crates/yaak-wasm/pkg` is committed and is what the web edition (`Dockerfile.web`,
`npm run web:dev`) runs for models, migrations and templates. It has to be rebuilt after
any change under `crates/` that the client depends on, including a new model field, or the
browser silently runs the old code. Without a wasm-capable clang, rebuild it in Docker:

```shell
scripts/wasm-builder/build.sh   # about a minute once the image and cargo cache exist
```

Then commit `crates/yaak-wasm/pkg`. Merging an upstream release brings upstream's package,
built without our changes, so run this after every sync too. `npm run web:dev` needs `cargo`
on the PATH (`source ~/.cargo/env`).

### Regenerating the TypeScript bindings

`cargo test -p yaak-models` (and `-p yaak-plugins`, `-p yaak-sync`, `-p yaak-git`) rewrites
the `bindings/*.ts` files, but unformatted, and the formatter ignores those paths. Restore
them with git and copy the changed lines in by hand instead, so the upstream diff stays small.

## Features

### GraphQL query builder (CORE-438)

A "Query Builder" side panel next to the Docs panel of the GraphQL editor: the schema as a
checkbox tree, ticking a field writes it into the query text, editing the text updates the
tree. Same as the builder in Postman, and it is the same component: the MIT-licensed
`graphiql-explorer`, vendored under `apps/yaak-client/components/graphql/builder/`, with two
additions marked `[shaman]` inside it: a search box that filters the tree (plain text, or
`/regex/`) and keeps the path to nested matches open, and one section per root type so
mutations and subscriptions are always reachable.

Upstream files touched, both by a few lines: `components/graphql/GraphQLEditor.tsx` (the
toolbar toggle) and `components/HttpRequestLayout.tsx` (mounting the panel). Everything else
is new files in `components/graphql/builder/`.

### Request tests (CORE-452)

A "Tests" tab on every HTTP and GraphQL request, working the way Postman's post-response
scripts do, replacing the Request Tests plugin. The script is stored in a new request field,
`testScript` (column `test_script`, migration `20260929000000_request-test-script.sql`), so
it is synced to the workspace YAML like everything else and shows in git diffs.

- **Editor**: Yaak's JavaScript editor plus completion for the test API. The API is declared
  once in `components/requestTests/api.ts`, so `pm.` offers its members, `pm.response.to.`
  its assertions, `expect(x).to.` the Chai chain, and each entry carries its documentation.
  Postman's snippets sit in a panel next to the editor and in the completion list. Syntax
  errors are underlined.
- **Runtime** (`sandbox.ts`): Postman's `pm` API on top of Chai 6, with `pm.test`,
  `pm.test.skip`, `pm.expect`, `pm.response` (`json`, `text`, `headers`, `to.have.*`,
  `to.be.*`, `to.not`, `jsonSchema` through Ajv), `pm.request`, `pm.info`, `pm.environment`,
  `pm.collectionVariables` / `pm.globals` (the workspace's base environment), `pm.variables`,
  the legacy `tests[]`, `responseBody`, `responseCode` and `postman.*`, plus the shorthand
  globals `test`, `expect`, `json`, `status`, `headers`, `body`, `elapsed`. Variable writes
  are applied to the environments when the script ends. `pm.sendRequest`, `pm.cookies` and
  `pm.execution` throw a message saying they are not available. Scripts run in a Web Worker
  created per run and stopped after 10 seconds.
- **Runs**: whenever a response finishes, however it was sent. The client hooks the model
  writes (`components/requestTests/init.ts`), not the Send button: the final write of an
  `http_response` with state `closed` runs its request's script, once, unless the request's
  "Run on send" switch is off (stored per request in the local key-value store). This is what
  covers the folder's "Send All", which is a bundled plugin sending from the Rust side, the
  sidebar's multi-select send and plugin sends. A response another window sent is that
  window's job. "Run" in the Tests tab re-runs against the last response without sending.
- **Folder report**: the folder page lists every request under it that has tests with the
  result of its latest response and the totals, filling in live while "Send All" runs, with
  "Run all tests" to re-run them all against the latest responses. Rows open the request's
  results. Folders without tests show nothing extra.
- **Results**: a "Tests" tab in the response pane with the passed/total badge, a
  passed/failed/skipped filter, Chai's failure messages, console output and a re-run button.

Upstream files touched, each by a few lines: `crates/yaak-models/src/models.rs` (the field),
the generated `bindings/gen_models.ts` copies, `components/HttpRequestPane.tsx` (the tab),
`components/HttpResponsePane.tsx` (the results tab), `components/FolderLayout.tsx` (the
report), `main.tsx` (the startup hook), `vite.config.ts` (`optimizeDeps.include` for chai and
ajv: the worker is their only importer, and left to discovery the dev server re-optimizes and
reloads the page on the first run, which loses that run) and `apps/yaak-client/package.json`
(chai, ajv). Everything else is new
under `apps/yaak-client/components/requestTests/`. Upstream has a `plan/test-assertions-ci`
branch with a different, declarative assertions model; if it lands, the two coexist until we
decide which to keep.
