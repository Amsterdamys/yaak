import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { snippetCompletion } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { ApiMember, ApiMembers } from "./api";
import { GLOBALS } from "./api";
import { SNIPPETS } from "./snippets";

export interface ChainSegment {
  name: string;
  /** `name(...)` rather than `name` */
  called: boolean;
}

export interface ParsedChain {
  /** The `a.b(...).c` in front of the partial word, outermost first. Empty at top level. */
  segments: ChainSegment[];
  /** The word being typed, possibly empty right after a dot. */
  partial: string;
  /** Offset of the partial word in the text. */
  from: number;
}

const identChar = /[\w$]/;
const space = /\s/;

/**
 * The member chain that ends at the end of `text`: `pm.response.to.have.st` gives segments
 * pm, response, to, have and partial "st"; `expect(x).to.` gives expect (called), to and an
 * empty partial. Parentheses are skipped as balanced groups, so arguments do not matter.
 */
export function parseChain(text: string): ParsedChain {
  let i = text.length;
  while (i > 0 && identChar.test(text[i - 1] as string)) i--;
  const partial = text.slice(i);
  const from = i;
  const segments: ChainSegment[] = [];

  for (;;) {
    let j = i;
    while (j > 0 && space.test(text[j - 1] as string)) j--;
    if (j === 0 || text[j - 1] !== ".") break;
    j--;
    while (j > 0 && space.test(text[j - 1] as string)) j--;

    let called = false;
    if (text[j - 1] === ")") {
      let depth = 0;
      let k = j;
      while (k > 0) {
        k--;
        const ch = text[k];
        if (ch === ")" || ch === "]" || ch === "}") depth++;
        else if (ch === "(" || ch === "[" || ch === "{") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (depth !== 0) return { segments: [], partial, from };
      j = k;
      called = true;
      while (j > 0 && space.test(text[j - 1] as string)) j--;
    }

    let s = j;
    while (s > 0 && identChar.test(text[s - 1] as string)) s--;
    if (s === j) {
      // Something that is not a name, like `[1, 2].` or `"x".`: not our API
      return { segments: [], partial, from: -1 };
    }
    segments.unshift({ name: text.slice(s, j), called });
    i = s;
  }

  return { segments, partial, from };
}

/** The members reachable after the chain, or null when the chain leaves the declared API. */
export function resolveMembers(root: ApiMembers, segments: ChainSegment[]): ApiMembers | null {
  let members: ApiMembers | undefined = root;
  for (const segment of segments) {
    const member: ApiMember | undefined = members[segment.name];
    if (member == null) return null;
    members = segment.called ? member.returns : member.members;
    if (members == null) return null;
  }
  return members;
}

function toCompletion(name: string, member: ApiMember): Completion {
  const base: Completion = {
    label: name,
    detail: member.detail,
    info: member.doc,
    type:
      member.kind === "function"
        ? "function"
        : member.kind === "namespace"
          ? "namespace"
          : "property",
    boost: member.boost,
  };
  if (member.snippet != null) return snippetCompletion(member.snippet, base);
  if (member.kind === "function") return snippetCompletion(`${name}(#{})`, base);
  return base;
}

const snippetCompletions: Completion[] = SNIPPETS.map((s) =>
  snippetCompletion(s.code, {
    label: s.title,
    detail: "snippet",
    type: "text",
    boost: -10,
  }),
);

const notInside = new Set([
  "String",
  "TemplateString",
  "LineComment",
  "BlockComment",
  "PropertyName",
  "PropertyDefinition",
]);

/** CodeMirror completion source for the test API and the snippets. */
export function completeTestApi(context: CompletionContext): CompletionResult | null {
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);
  if (notInside.has(node.name) && node.name !== "PropertyName") return null;

  const windowStart = Math.max(0, context.pos - 2000);
  const chain = parseChain(context.state.sliceDoc(windowStart, context.pos));
  if (chain.from < 0) return null;
  const from = windowStart + chain.from;

  if (chain.segments.length === 0) {
    if (chain.partial === "" && !context.explicit) return null;
    const options = Object.entries(GLOBALS).map(([name, m]) => toCompletion(name, m));
    return { from, options: [...options, ...snippetCompletions], validFor: /^[\w$]*$/ };
  }

  const members = resolveMembers(GLOBALS, chain.segments);
  if (members == null) return null;
  const options = Object.entries(members).map(([name, m]) => toCompletion(name, m));
  return { from, options, validFor: /^[\w$]*$/ };
}
