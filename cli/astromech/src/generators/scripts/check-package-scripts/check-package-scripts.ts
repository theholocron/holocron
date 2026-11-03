import {
	LEGACY_NAMES,
	RESERVED_SCRIPT_NAMES,
	resolveTaskName,
	suiteMembers,
	SUITES,
} from "../../../vocabulary/index.js";
import type { PackageRole, PackageScriptProblem } from "./check-package-scripts.type.js";

/** Variants of a script that npm and pnpm users already expect (`test:watch`, `lint:fix`); not task ids. */
const VARIANT_SCRIPTS: ReadonlySet<string> = new Set(["test:watch", "lint:fix"]);

/** `true` when a script's body hands the work back to turbo or the CLI. */
function callsTheTaskMachinery(command: string): boolean {
	return /^(turbo|holocron)\s+run\b/.test(command.trim());
}

/**
 * The rule violations in one `package.json`'s `scripts` (spec `ci-flat-task-vocabulary`, "The recursion hazard" and "The
 * check that keeps them aligned"):
 *
 * - a script named like an npm or pnpm lifecycle word (`publish`, `install`, …), except the root's `prepare` (husky);
 * - a script named like a suite (`test`, `lint`, `scan`) in a package: a suite is a turbo task with no script, and a
 *   package's own would be run by `turbo run test` as well as the aggregator. The root holds the suite scripts;
 * - a leaf script that calls `turbo run` or `holocron run` in a package: it must hold the real tool command, or turbo
 *   would run it, and it would run turbo again;
 * - a script that looks like a suite member but is none (`test:unt`), other than a known variant;
 * - an old dotted task name, as a `warn` while those are accepted.
 */
export function checkPackageScripts(
	scripts: Readonly<Record<string, string>>,
	role: PackageRole
): PackageScriptProblem[] {
	const problems: PackageScriptProblem[] = [];
	for (const [script, command] of Object.entries(scripts)) {
		const fail = (message: string): void => {
			problems.push({ level: "fail", script, message });
		};
		const isLeaf = resolveTaskName(script).length > 0;
		const suite = script.split(":")[0]!;

		if (RESERVED_SCRIPT_NAMES.has(script) && !(role === "root" && script === "prepare")) {
			fail(`"${script}" is a name npm and pnpm give a meaning of their own, so no script may carry it`);
		} else if (role === "package" && SUITES.includes(script)) {
			fail(
				`"${script}" is a suite, a turbo task with no script: use a leaf (${suiteMembers(script).join(", ")})`
			);
		} else if (role === "package" && isLeaf && callsTheTaskMachinery(command)) {
			fail(
				`"${script}" must hold the real tool command, not a call to \`${command.trim().split(/\s+/)[0]} run\``
			);
		} else if (LEGACY_NAMES[script]) {
			const ids = LEGACY_NAMES[script].map((target) => target.id).join(", ");
			problems.push({ level: "warn", script, message: `"${script}" is a deprecated task name: use ${ids}` });
		} else if (script.includes(":") && !isLeaf && !VARIANT_SCRIPTS.has(script) && SUITES.includes(suite)) {
			fail(
				`"${script}" looks like a member of the ${suite} suite but is not one (${suiteMembers(suite).join(", ")})`
			);
		}
	}
	return problems;
}
