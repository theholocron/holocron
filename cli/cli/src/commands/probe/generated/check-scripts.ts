import { checkPackageScripts, mergeScripts } from "@theholocron/astromech";

/** One `package.json` of the repo and the scripts it holds. */
export interface ScriptsOfPackage {
	/** Where it sits, relative to the checkout (`.` for the root). */
	location: string;
	scripts: Readonly<Record<string, string>>;
}

export interface CheckScriptsInput {
	/** The root's scripts and every other workspace package's. */
	packages: readonly ScriptsOfPackage[];
	/** What `scriptsFor` and the rest of the root's scripts should be, or `null` when `syncScripts` is `false`. */
	desired: Readonly<Record<string, string>> | null;
	/** The keys the generated `turbo.json` fans out, which guard a real root command (see `mergeScripts`). */
	turboKeys: ReadonlySet<string>;
}

export interface ScriptProblems {
	/** Lines that fail the check. */
	fail: string[];
	/** Lines that only say something (a deprecated name accepted for a window). */
	info: string[];
}

/**
 * Problems with the scripts: a root script that differs from what `scriptsFor` writes (a hand edit is drift, as it is
 * for any generated file), and in every `package.json` a script that breaks a naming or recursion rule
 * (`checkPackageScripts`). A deprecated dotted name is reported once for the whole repo, not failed, while the old
 * names are accepted.
 */
export function checkScripts({ packages, desired, turboKeys }: CheckScriptsInput): ScriptProblems {
	const problems: ScriptProblems = { fail: [], info: [] };
	const deprecated: string[] = [];
	for (const { location, scripts } of packages) {
		const file = location === "." ? "package.json" : `${location}/package.json`;
		if (location === "." && desired !== null) {
			for (const name of mergeScripts(scripts, desired, turboKeys).changed) {
				problems.fail.push(
					`${file}: script "${name}" is ${scripts[name] === undefined ? "missing" : JSON.stringify(scripts[name])}, holocron generates ${JSON.stringify(desired[name])}; run \`holocron sync\` and commit the result`
				);
			}
		}
		const found = checkPackageScripts(scripts, location === "." ? "root" : "package");
		for (const problem of found.filter((p) => p.level === "fail"))
			problems.fail.push(`${file}: ${problem.message}`);
		const names = found.filter((p) => p.level === "warn").map((p) => p.script);
		if (names.length > 0) deprecated.push(`${file} (${names.join(", ")})`);
	}
	if (deprecated.length > 0) {
		const [first] = deprecated;
		problems.info.push(
			`deprecated task names still used as scripts in ${deprecated.length} package.json file(s), for example ${first}: rename them to flat ids`
		);
	}
	return problems;
}
