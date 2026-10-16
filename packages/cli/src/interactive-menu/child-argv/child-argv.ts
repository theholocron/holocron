import type { CommandEntry } from "../command-registry/index.js";

/**
 * `--token` (repeatable), `--org`, `--cwd`, `--dry-run` — the global flags a
 * menu-launched child should inherit from the parent invocation. Everything
 * else (command-specific options) was never captured by the top-level `$0`
 * handler in the first place, so there's nothing else to forward.
 *
 * `dryRunOverride`, when passed, wins over `argv.dryRun` — `launchMenu`'s
 * dry-run offer needs to force `--dry-run` on for the preview spawn and
 * force it back off for the real-run spawn that follows, regardless of
 * what was on the original invocation.
 */
export function forwardedFlags(argv: Record<string, unknown>, dryRunOverride?: boolean): string[] {
	const out: string[] = [];
	const tokens = argv.token as string[] | undefined;
	for (const t of tokens ?? []) out.push("--token", t);
	if (typeof argv.org === "string") out.push("--org", argv.org);
	if (typeof argv.cwd === "string") out.push("--cwd", argv.cwd);
	if (dryRunOverride ?? argv.dryRun === true) out.push("--dry-run");
	return out;
}

/** `entry.spawnArgs` if set, else `entry.name` split into tokens — resolved positionals appended, then forwarded flags. */
export function buildChildArgv(
	entry: CommandEntry,
	positionals: string[],
	parentArgv: Record<string, unknown>,
	dryRunOverride?: boolean
): string[] {
	return [
		...(entry.spawnArgs ?? entry.name.split(" ")),
		...positionals,
		...forwardedFlags(parentArgv, dryRunOverride),
	];
}
