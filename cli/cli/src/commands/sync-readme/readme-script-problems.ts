import { PNPM_BUILTIN_COMMANDS, resolveTaskName, SUITES } from "@theholocron/astromech";

/**
 * The scripts a README tells the reader to run that the package does not have: a `pnpm test` where no `test` script
 * exists is exactly what #1262 started from. Only a task or a suite name counts (`pnpm install` and `pnpm exec` are
 * pnpm's own), and a name pnpm has a command for counts only in its `pnpm run <name>` form, because `pnpm deploy` never
 * runs a script. One line per missing script, in the order they first appear.
 */
export function readmeScriptProblems(readme: string, scripts: Readonly<Record<string, string>>): string[] {
	const missing = new Set<string>();
	for (const [, run, name] of readme.matchAll(/\bpnpm (run )?([a-z][\w:.-]*)/g)) {
		const isScriptName = SUITES.includes(name!) || resolveTaskName(name!).length > 0;
		if (!isScriptName || name! in scripts) continue;
		if (run === undefined && PNPM_BUILTIN_COMMANDS.has(name!)) continue;
		missing.add(name!);
	}
	return [...missing].map(
		(name) => `README.md tells the reader to run \`pnpm ${name}\`, but package.json has no "${name}" script`
	);
}
