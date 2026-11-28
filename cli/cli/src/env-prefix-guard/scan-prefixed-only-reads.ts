import ts from "typescript";

import { isCallTo, literalName, looksLikeEnv } from "./env-read-nodes.js";
import type { PrefixedOnlyRead } from "./scan-prefixed-only-reads.type.js";

const PREFIX = "HOLOCRON_";
const LIST_CALLS = new Set(["resolveValue", "firstEnv"]);

/**
 * The group 1 variables `source` reads in their `HOLOCRON_` spelling only, so the documented bare fallback
 * (`HOLOCRON_<NAME>`, then `<NAME>`, #1864) would be lost. A read is `<env>.get("HOLOCRON_X")`, `env.HOLOCRON_X`,
 * `env["HOLOCRON_X"]` and a name handed to `firstEnv` or `resolveValue`. It passes when the same file also holds the
 * bare name as a string literal (the explicit pair, e.g. `firstEnv(env, ["HOLOCRON_X", "X"])`). A read through
 * `holocronEnv()` names only the bare name, so it never shows up here.
 *
 * @param source - The TypeScript source text.
 * @param groupOne - The bare names of group 1 of `environment-variables.mdx`.
 */
export function scanPrefixedOnlyReads(source: string, groupOne: ReadonlySet<string>): PrefixedOnlyRead[] {
	const file = ts.createSourceFile("scanned.ts", source, ts.ScriptTarget.Latest, true);
	const literals = new Set<string>();
	const found: PrefixedOnlyRead[] = [];

	const collect = (node: ts.Node): void => {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text);
		ts.forEachChild(node, collect);
	};
	collect(file);

	const check = (spelled: string | undefined, at: ts.Node): void => {
		if (!spelled?.startsWith(PREFIX)) return;
		const name = spelled.slice(PREFIX.length);
		if (!groupOne.has(name) || literals.has(name)) return;
		found.push({ name, line: file.getLineAndCharacterOfPosition(at.getStart(file)).line + 1 });
	};

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			if (
				ts.isPropertyAccessExpression(callee) &&
				callee.name.text === "get" &&
				looksLikeEnv(callee.expression)
			) {
				check(literalName(node.arguments[0]), node);
			} else if (isCallTo(node, LIST_CALLS)) {
				for (const arg of node.arguments) {
					if (ts.isArrayLiteralExpression(arg))
						for (const element of arg.elements) check(literalName(element), element);
					else check(literalName(arg), arg);
				}
			}
		} else if (ts.isPropertyAccessExpression(node) && looksLikeEnv(node.expression)) {
			check(node.name.text, node);
		} else if (ts.isElementAccessExpression(node) && looksLikeEnv(node.expression)) {
			check(literalName(node.argumentExpression), node);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return found;
}
