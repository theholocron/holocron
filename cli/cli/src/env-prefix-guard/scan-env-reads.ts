import ts from "typescript";

import { isCallTo, literalName, looksLikeEnv } from "./env-read-nodes.js";
import type { UnprefixedEnvRead } from "./scan-env-reads.type.js";

const NAME = /^[A-Z][A-Z0-9_]*$/;
/** Prefixes that already name their owner: Holocron's, and the per-service ones that stay as they are. */
const OWNED_PREFIXES = ["HOLOCRON_", "SENTINEL_", "COMLINK_"];
/** Calls that build a lookup reading `HOLOCRON_<NAME>` before `<NAME>`. */
const PREFIXING_CALLS = new Set(["holocronEnv", "withEnvPrefix"]);

/** Identifiers declared (or given as a parameter default) as a prefixing lookup, e.g. `const env = holocronEnv()`. */
function prefixedLookups(file: ts.SourceFile): Set<string> {
	const found = new Set<string>();
	const visit = (node: ts.Node): void => {
		if (
			(ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
			ts.isIdentifier(node.name) &&
			isCallTo(node.initializer, PREFIXING_CALLS)
		) {
			found.add(node.name.text);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return found;
}

function isPrefixed(node: ts.Node, lookups: ReadonlySet<string>): boolean {
	return isCallTo(node, PREFIXING_CALLS) || (ts.isIdentifier(node) && lookups.has(node.text));
}

/**
 * The bare names `source` reads from the environment that are neither owned (`HOLOCRON_`, `SENTINEL_`, `COMLINK_`),
 * allowlisted, nor read through the prefix. A read is `<env>.get("NAME")`, `env.NAME`, `env["NAME"]`, `process.env.NAME`,
 * and the names handed to `firstEnv` and to `resolveValue`. A read through `holocronEnv()` / `withEnvPrefix()` or a
 * variable declared from one, and `resolveValue(names, env, { prefix })`, are the prefix helper. A bare name is also fine
 * when the same file reads its `HOLOCRON_` spelling (the explicit pair). Names built at run time are not looked at.
 *
 * @param source - The TypeScript source text.
 * @param allowed - Bare names a third party reads itself, or whose move is deferred (see `env-allowlist.ts`).
 */
export function scanEnvReads(source: string, allowed: ReadonlySet<string>): UnprefixedEnvRead[] {
	const file = ts.createSourceFile("scanned.ts", source, ts.ScriptTarget.Latest, true);
	const lookups = prefixedLookups(file);
	const literals = new Set<string>();
	const found: UnprefixedEnvRead[] = [];

	const collect = (node: ts.Node): void => {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text);
		ts.forEachChild(node, collect);
	};
	collect(file);

	const check = (name: string | undefined, at: ts.Node): void => {
		if (
			!name ||
			OWNED_PREFIXES.some((p) => name.startsWith(p)) ||
			allowed.has(name) ||
			literals.has(`HOLOCRON_${name}`)
		)
			return;
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
				if (!isPrefixed(callee.expression, lookups)) check(literalName(node.arguments[0]), node);
			} else if (ts.isIdentifier(callee) && callee.text === "resolveValue") {
				const names = node.arguments[0];
				if (node.arguments.length < 3 && names && ts.isArrayLiteralExpression(names)) {
					for (const element of names.elements) check(literalName(element), element);
				}
			} else if (ts.isIdentifier(callee) && callee.text === "firstEnv") {
				const [env, ...rest] = node.arguments;
				if (!(env && isPrefixed(env, lookups))) {
					for (const arg of rest) {
						if (ts.isArrayLiteralExpression(arg))
							for (const element of arg.elements) check(literalName(element), element);
						else check(literalName(arg), arg);
					}
				}
			}
		} else if (ts.isPropertyAccessExpression(node) && looksLikeEnv(node.expression) && NAME.test(node.name.text)) {
			if (!isPrefixed(node.expression, lookups)) check(node.name.text, node);
		} else if (ts.isElementAccessExpression(node) && looksLikeEnv(node.expression)) {
			if (!isPrefixed(node.expression, lookups)) check(literalName(node.argumentExpression), node);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return found;
}
