import type { GraphQLSchema } from "graphql";
import { getNamedType, isInterfaceType, isObjectType } from "graphql";

/** What the vendored tree receives: a name test plus the set of types that lead to a match. */
export interface FieldFilter {
  test: (fieldName: string) => boolean;
  /** Object and interface type names that have a matching field, directly or through nested fields. */
  matchingTypes: Set<string>;
  /** Object and interface type names with a directly matching field. */
  directTypes: Set<string>;
  /**
   * Whether rows that lead to a match may be opened without the user clicking them. Off when
   * the text matches a large share of the schema (a single letter, say): opening everything
   * that leads to "e" is the whole schema, three levels deep, and that is more rows than a
   * tab survives.
   */
  autoOpen: boolean;
  /** Rows already decided by claimAutoOpen, by path, so a re-render keeps the same tree. */
  openDecisions: Map<string, boolean>;
  /** How many more rows claimAutoOpen may open for this filter. */
  openBudget: number;
}

/** Direct field matches above this leave every row closed; the rows still filter. */
const MAX_MATCHES_FOR_AUTO_OPEN = 200;
/** Rows one filter may open on its own, over the whole tree, whatever the schema's fan-out. */
const MAX_AUTO_OPEN_ROWS = 120;

/**
 * Whether the row at `path` opens on its own. The first call for a path decides, against the
 * filter's budget; later calls (re-renders of a subtree, a hover) return the same answer, so
 * a row never collapses because another subtree spent the budget first.
 */
export function claimAutoOpen(filter: FieldFilter, path: string): boolean {
  const decided = filter.openDecisions.get(path);
  if (decided != null) return decided;
  const open = filter.autoOpen && filter.openBudget > 0;
  if (open) filter.openBudget -= 1;
  filter.openDecisions.set(path, open);
  return open;
}

/**
 * The search box text as a matcher.
 *
 * - empty or whitespace: no filter
 * - `/pattern/` or `/pattern/i`: a regular expression (an invalid one is searched literally)
 * - anything else: case-insensitive substring
 */
export function parseFilterPattern(text: string): RegExp | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  const asRegex = /^\/(.+)\/([a-z]*)$/.exec(trimmed);
  if (asRegex != null) {
    const [, source = "", flags = ""] = asRegex;
    // A global or sticky flag would make `test` stateful and alternate its answers
    const usable = flags.replace(/[gy]/g, "");
    try {
      return new RegExp(source, usable.includes("i") ? usable : `${usable}i`);
    } catch {
      return literal(source);
    }
  }

  return literal(trimmed);
}

function literal(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), "i");
}

/** Which named types have a field pointing at which parent types; one walk per schema. */
const reverseEdgesCache = new WeakMap<GraphQLSchema, Map<string, string[]>>();

function reverseEdges(schema: GraphQLSchema): Map<string, string[]> {
  const cached = reverseEdgesCache.get(schema);
  if (cached != null) return cached;

  const edges = new Map<string, string[]>();
  for (const type of Object.values(schema.getTypeMap())) {
    if (!isObjectType(type) && !isInterfaceType(type)) continue;
    for (const field of Object.values(type.getFields())) {
      const child = getNamedType(field.type);
      if (!isObjectType(child) && !isInterfaceType(child)) continue;
      const parents = edges.get(child.name) ?? [];
      parents.push(type.name);
      edges.set(child.name, parents);
    }
  }
  reverseEdgesCache.set(schema, edges);
  return edges;
}

/**
 * Build the filter for the tree: every type with a directly matching field name, plus every
 * type that can reach one of those through object-typed fields, so the tree can keep the path
 * to a nested match visible.
 */
export function buildFieldFilter(schema: GraphQLSchema, text: string): FieldFilter | null {
  const pattern = parseFilterPattern(text);
  if (pattern == null) return null;

  const matchingTypes = new Set<string>();
  const directTypes = new Set<string>();
  const queue: string[] = [];
  let matches = 0;
  for (const type of Object.values(schema.getTypeMap())) {
    if (!isObjectType(type) && !isInterfaceType(type)) continue;
    const matching = Object.keys(type.getFields()).filter((name) => pattern.test(name)).length;
    if (matching > 0) {
      matches += matching;
      directTypes.add(type.name);
      matchingTypes.add(type.name);
      queue.push(type.name);
    }
  }

  const edges = reverseEdges(schema);
  while (queue.length > 0) {
    const name = queue.pop() as string;
    for (const parent of edges.get(name) ?? []) {
      if (matchingTypes.has(parent)) continue;
      matchingTypes.add(parent);
      queue.push(parent);
    }
  }

  return {
    test: (name) => pattern.test(name),
    matchingTypes,
    directTypes,
    autoOpen: matches <= MAX_MATCHES_FOR_AUTO_OPEN,
    openDecisions: new Map(),
    openBudget: MAX_AUTO_OPEN_ROWS,
  };
}
