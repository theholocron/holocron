/** Reads `--layer <word>` (or `--layer=<word>`) from the words after the probe name, which the CLI passes when `--environment` named a layer. */
export function parseLayer(args: readonly string[]): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "--layer") return args[i + 1];
		if (arg.startsWith("--layer=")) return arg.slice("--layer=".length);
	}
	return undefined;
}
