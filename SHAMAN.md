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
