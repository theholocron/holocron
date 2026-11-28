import ts from "typescript";

const NAME = /^[A-Z][A-Z0-9_]*$/;

/** Whether `node` is a call to a plain function named in `names`. */
export function isCallTo(node: ts.Node | undefined, names: ReadonlySet<string>): boolean {
	return (
		node !== undefined &&
		ts.isCallExpression(node) &&
		ts.isIdentifier(node.expression) &&
		names.has(node.expression.text)
	);
}

/** The upper-case name a string literal spells, or `undefined` for anything else. */
export function literalName(node: ts.Node | undefined): string | undefined {
	if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && NAME.test(node.text))
		return node.text;
	return undefined;
}

/** Whether `node` holds the environment: `env`, `process.env`, `deps.env`, a `lookup`, `createEnvLookup()`. */
export function looksLikeEnv(node: ts.Node): boolean {
	if (isCallTo(node, new Set(["createEnvLookup"]))) return true;
	if (ts.isIdentifier(node)) return /env|lookup/i.test(node.text);
	return ts.isPropertyAccessExpression(node) && /env|lookup/i.test(node.name.text);
}
