/** What follows `probe cloudflare token`: the layer the token is held in (set by `--environment`), and zone names to limit the zone checks to. */
export interface TokenProbeArgs {
	/** `--layer <word>`, passed by the CLI when `--environment` named a layer (`ci`, `dev`); the token is then checked against that layer. */
	layer?: string;
	/** `--token-name <VAR>`, passed by the CLI with `--environment`: the declared token being checked, so the layer's expectations are that token's own. */
	tokenName?: string;
	/** Zone names; empty means every zone the token can see, up to a few. */
	zones: string[];
}

/** Reads the words after the probe name: `--layer <word>`, `--token-name <VAR>` and any number of zone names. */
export function parseTokenArgs(args: readonly string[]): TokenProbeArgs {
	const zones: string[] = [];
	let layer: string | undefined;
	let tokenName: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "--layer") layer = args[++i];
		else if (arg.startsWith("--layer=")) layer = arg.slice("--layer=".length);
		else if (arg === "--token-name") tokenName = args[++i];
		else if (arg.startsWith("--token-name=")) tokenName = arg.slice("--token-name=".length);
		else if (!arg.startsWith("--")) zones.push(arg);
	}
	return { ...(layer ? { layer } : {}), ...(tokenName ? { tokenName } : {}), zones };
}
