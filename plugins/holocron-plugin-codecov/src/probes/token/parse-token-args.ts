import type { TokenProbeArgs } from "./token.type.js";

/** Reads `--layer <word>` and `--token-name <VAR>` (either spelling) from the words after the probe name. */
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
