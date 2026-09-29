# Vendored graphiql-explorer

`Explorer.tsx` is the click-to-build query tree from
[OneGraph/graphiql-explorer](https://github.com/OneGraph/graphiql-explorer) (MIT, see `LICENSE`),
the component behind the "Explorer" panel in GraphiQL and the GraphQL query builder in Postman.

- Origin: `src/Explorer.js` at commit `f82aed1649d1` (2022-05-12, npm `graphiql-explorer@0.9.0`).
- The package is unmaintained and declares React 16 / graphql 15 peers, but the code is a plain
  class component using only stable `graphql` functions, so it runs unchanged on React 19 and
  graphql 17. Vendoring avoids the peer-dependency conflict and lets Vite tree-shake it.

## Modifications

1. Flow type annotations removed with `flow-remove-types --pretty` (no semantic change).
2. A header with `// @ts-nocheck` and `/* oxlint-disable */`: the file is third-party code and is
   not held to this repo's lint or type rules.
3. `export { Explorer };` appended so the tree can be used without the GraphiQL title-bar wrapper.
4. Formatted with the repo formatter (`vp fmt`), which the pre-commit hook applies anyway.

Everything else is the upstream source unchanged. To refresh it, repeat the four steps on the
new upstream file. Yaak-specific styling lives in `../builder.css` and `../GraphQLQueryBuilder.tsx`,
never in this file.
