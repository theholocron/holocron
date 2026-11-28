const TITLE = /^\s*[A-Za-z]+(?:\(([^)]*)\))?!?:/;

/**
 * The scopes of a Conventional Commit title: `feat(sentinel): ...` gives `["sentinel"]`, `fix(cli, docs)!: ...` gives
 * `["cli", "docs"]`. A title with no scope, or that is not in the `type(scope): subject` form, gives none.
 */
export function titleScopes(title: string): string[] {
	const scope = TITLE.exec(title)?.[1];
	if (scope === undefined) return [];
	return scope
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s !== "");
}
