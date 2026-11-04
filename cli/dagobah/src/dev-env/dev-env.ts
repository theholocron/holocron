import { spawnSync } from "node:child_process";

import { parse } from "dotenv";

import type { DevEnv, LoadDevEnvInput } from "./dev-env.type.js";

/**
 * The environment a local app runs with: the variables already in the process, and what the 1Password
 * Environment `environment` holds for the rest (read with `op environment secret list`, the way the 1Password
 * plugin reads one, so Touch ID asks once). The process wins, so a variable exported for one run overrides the
 * Environment. The `required` ones must end up set; a message names the ones that are not, and never a
 * value. Nothing is written to disk.
 */
export function loadDevEnv<K extends string>(input: LoadDevEnvInput<K>): DevEnv<K> {
	const REQUIRED = input.required;
	const env = input.env ?? process.env;
	const present = (name: string) => (env[name] ?? "") !== "";
	let merged: NodeJS.ProcessEnv = env;

	if (!REQUIRED.every(present)) {
		const result = (input.spawn ?? spawnSync)(
			"op",
			["environment", "secret", "list", input.environment, "--reveal", "--format=dotenv"],
			{ encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] }
		);
		if (result.error || result.status !== 0) {
			const why = result.error?.message ?? (result.stderr as string).trim().split("\n")[0];
			throw new Error(`could not read the 1Password Environment "${input.environment}": ${why || "op failed"}`);
		}
		merged = {
			...parse(String(result.stdout)),
			...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== "")),
		};
	}

	const missing = REQUIRED.filter((name) => (merged[name] ?? "") === "");
	if (missing.length > 0) {
		throw new Error(`missing from the environment and from "${input.environment}": ${missing.join(", ")}`);
	}
	return merged as DevEnv<K>;
}
