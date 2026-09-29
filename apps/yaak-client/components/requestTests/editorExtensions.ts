import { javascriptLanguage } from "@codemirror/lang-javascript";
import { syntaxTree } from "@codemirror/language";
import type { Diagnostic } from "@codemirror/lint";
import { lintGutter, linter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { completeTestApi } from "./completion";

/** Red underlines on the parser's error nodes, the same hint Postman's editor gives. */
const syntaxErrorLinter = linter(
  (view) => {
    const diagnostics: Diagnostic[] = [];
    const docLength = view.state.doc.length;
    syntaxTree(view.state)
      .cursor()
      .iterate((node) => {
        if (!node.type.isError) return;
        const from = Math.min(node.from, docLength);
        const to = Math.max(node.to, Math.min(from + 1, docLength));
        diagnostics.push({ from, to, severity: "error", message: "Syntax error" });
      });
    return diagnostics;
  },
  { delay: 400 },
);

/** Everything the test script editor adds on top of Yaak's JavaScript editor. */
export function testScriptExtensions(): Extension[] {
  return [
    javascriptLanguage.data.of({ autocomplete: completeTestApi }),
    syntaxErrorLinter,
    lintGutter(),
  ];
}
