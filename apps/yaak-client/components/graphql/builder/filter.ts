import type { GraphQLSchema } from "graphql";
import { getNamedType, isInterfaceType, isObjectType } from "graphql";

/** What the vendored tree receives: a name test plus the set of types that lead to a match. */
export interface FieldFilter {
  test: (fieldName: string) => boolean;
  /** Object and interface type names that have a matching field, directly or through nested fields. */
  matchingTypes: Set<string>;
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
    try {
      return new RegExp(source, flags.includes("i") ? flags : `${flags}i`);
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
  const queue: string[] = [];
  for (const type of Object.values(schema.getTypeMap())) {
    if (!isObjectType(type) && !isInterfaceType(type)) continue;
    if (Object.keys(type.getFields()).some((name) => pattern.test(name))) {
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

  return { test: (name) => pattern.test(name), matchingTypes };
}
