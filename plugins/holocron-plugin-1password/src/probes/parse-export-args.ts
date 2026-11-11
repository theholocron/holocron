import type { ExportEnvironmentArgs } from "./export-environment.type.js";

const USAGE = "usage: holocron probe 1password export-environment <environment> [--only NAME]... [--copy]";

/** Reads the words after `export-environment`: one Environment, any number of `--only NAME`, and `--copy`. */
export function parseExportArgs(args: readonly string[]): ExportEnvironmentArgs {
	const only: string[] = [];
	const positional: string[] = [];
	let copy = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "--copy") copy = true;
		else if (arg === "--only") {
			const name = args[++i];
			if (name === undefined) throw new Error(`--only needs a variable name. ${USAGE}`);
			only.push(name);
		} else if (arg.startsWith("--only=")) only.push(arg.slice("--only=".length));
		else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}. ${USAGE}`);
		else positional.push(arg);
	}
	if (positional.length !== 1) throw new Error(`name one Environment. ${USAGE}`);
	return { environment: positional[0]!, only, copy };
}
