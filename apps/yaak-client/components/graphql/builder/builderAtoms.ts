import { atomWithKVStorage } from "../../../lib/atoms/atomWithKVStorage";

/** Per-request flag: is the click-to-build query panel open. Persisted like the Docs panel. */
export const showGraphQLBuilderAtom = atomWithKVStorage<Record<string, boolean | undefined>>(
  "show_graphql_builder",
  {},
);
