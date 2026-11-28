/** One entry of a GraphQL response's `errors` array, with the fields GitHub fills in. */
export interface GraphQLErrorEntry {
	message: string;
	type?: string;
	path?: Array<string | number>;
}

/** The distinct errors of a response, in order, and the one-line text for them. */
export interface GraphQLErrorSummary {
	/** The errors with repeats removed (same message, type and path). */
	distinct: GraphQLErrorEntry[];
	/** One sentence per distinct error: the message, then `type` and `path` in brackets when present. */
	text: string;
}

/**
 * Collapses a GraphQL `errors` array. GitHub repeats one error for every node a query exceeded a limit on, so a single
 * failure can arrive as hundreds of identical entries; each distinct message is printed once, with its `type` and
 * `path` when it has them.
 */
export function describeGraphQLErrors(errors: readonly GraphQLErrorEntry[]): GraphQLErrorSummary {
	const seen = new Set<string>();
	const distinct: GraphQLErrorEntry[] = [];
	const lines: string[] = [];
	for (const e of errors) {
		const where = [e.type, e.path && e.path.length > 0 ? e.path.join(".") : undefined].filter(Boolean).join(", ");
		const line = where ? `${e.message} [${where}]` : e.message;
		if (seen.has(line)) continue;
		seen.add(line);
		distinct.push(e);
		lines.push(line);
	}
	return { distinct, text: lines.join("; ") };
}
