/** What follows `probe axiom token`: the layer the token is held in (set by `--environment`), and dataset names to try. */
export interface TokenProbeArgs {
	/** `--layer <word>`, passed by the CLI when `--environment` named a layer (`ci`, `dev`); the token is then checked against that layer. */
	layer?: string;
	/** Dataset names; empty means the plugin's own dataset. */
	datasets: string[];
}

/** Reads the words after the probe name: `--layer <word>` and any number of dataset names. */
export function parseTokenArgs(args: readonly string[]): TokenProbeArgs {
	const datasets: string[] = [];
	let layer: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "--layer") layer = args[++i];
		else if (arg.startsWith("--layer=")) layer = arg.slice("--layer=".length);
		else if (!arg.startsWith("--")) datasets.push(arg);
	}
	return { ...(layer ? { layer } : {}), datasets };
}
