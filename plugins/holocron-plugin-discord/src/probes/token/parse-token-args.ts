/** Reads `--layer <word>` and `--token-name <VAR>` (or the `=` forms) from the words after `probe discord token`; the CLI passes them with `--environment`: the layer, and which declared token is being checked. */
export function parseTokenArgs(args: readonly string[]): { layer?: string; tokenName?: string } {
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
