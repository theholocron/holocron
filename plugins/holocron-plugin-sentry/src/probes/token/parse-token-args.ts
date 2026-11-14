/** What follows `probe sentry token`: the layer the token is held in and which declared token it is, both set by `--environment`. */
export interface TokenProbeArgs {
	/** `--layer <word>`, passed by the CLI when `--environment` named a layer (`ci`, `dev`); the token is then checked against that layer. */
	layer?: string;
	/** `--token-name <VAR>`, passed by the CLI with `--environment`: the declared token being checked, so the layer's expectations are that token's own. */
	tokenName?: string;
}

/** Reads `--layer <word>` and `--token-name <VAR>` (either spelling). Anything else, and a flag with no value, is ignored. */
export function parseTokenArgs(args: readonly string[]): TokenProbeArgs {
	let layer: string | undefined;
	let tokenName: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "--layer") layer = args[++i];
		else if (arg.startsWith("--layer=")) layer = arg.slice("--layer=".length);
		else if (arg === "--token-name") tokenName = args[++i];
		else if (arg.startsWith("--token-name=")) tokenName = arg.slice("--token-name=".length);
	}
	return { ...(layer ? { layer } : {}), ...(tokenName ? { tokenName } : {}) };
}
