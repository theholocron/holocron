import { PNPM_BUILTIN_COMMANDS, resolveTaskName, scriptName, SUITES, TASKS } from "@theholocron/astromech";

import type { PackagesRegistry, ReadmeSections, RepoTemplateConfig } from "./generate-readme.type.js";

/** Scripts that are neither a task nor a check: what a contributor runs while working (spec: "the dev scripts"). */
const DEV_SCRIPTS = ["dev", "preview", "start", "docs:dev", "docs:build", "docs:preview", "test:watch"];

/** Scripts older READMEs listed that are not task ids; kept so their rows do not vanish. */
const OTHER_SCRIPTS = ["test:coverage", "test:storybook", "test:cypress", "audit"];

/**
 * The scripts a development table lists, in order: each suite and then its leaves in registry order, then the dev
 * scripts (spec `ci-flat-task-vocabulary`, "The README development table"). A task that only runs in CI (`release`,
 * `scan:code`) has no script to list; a package-scoped one (`deploy`) may.
 */
function scriptOrder(): string[] {
	const order: string[] = [];
	for (const [id, def] of Object.entries(TASKS)) {
		if (def.scope === "repo" && def.local === null && def.linterGroup === undefined) continue;
		if (def.suite !== undefined && !order.includes(def.suite)) order.push(def.suite);
		order.push(scriptName(id));
	}
	return [...order, ...DEV_SCRIPTS, ...OTHER_SCRIPTS];
}

/**
 * What a contributor types for a script: `pnpm <script>`, or `pnpm run <script>` for a name pnpm has a command of its
 * own for (`pnpm deploy` runs pnpm's `deploy`, never the script).
 */
export function pnpmCommand(script: string): string {
	return PNPM_BUILTIN_COMMANDS.has(script) ? `pnpm run ${script}` : `pnpm ${script}`;
}

/** The `holocron run` call that does what a script does (a suite, or one task: `test:unit` is `test unit`); none for a dev script. */
function holocronEquivalent(script: string): string {
	if (SUITES.includes(script)) return `\`holocron run ${script}\``;
	const [target] = resolveTaskName(script);
	return target === undefined ? "—" : `\`holocron run ${target.id.replace(":", " ")}\``;
}

export function generateReadme(config: RepoTemplateConfig): ReadmeSections {
	return {
		description: config.description,
		...(config.packages !== undefined && {
			packages: generatePackages(config.packages),
		}),
		...(config.installation !== undefined && {
			installation: generateInstallation(config.installation),
		}),
		development: generateDevelopment(config.scripts),
		releases: generateReleases(config.homepage),
	};
}

function generatePackages(packages: PackagesRegistry): string {
	const rows = Object.values(packages)
		.map((entry) => `| \`${entry.package}\` | [Docs](${entry.docsUrl}) | [npm](${entry.npmUrl}) |`)
		.join("\n");
	return `| Package | Docs | npm |\n|---|---|---|\n${rows}`;
}

function generateInstallation(packageName: string): string {
	return `\`\`\`sh\npnpm add ${packageName}\n\`\`\``;
}

function generateDevelopment(scripts: Record<string, string>): string {
	const rows = scriptOrder()
		.filter((name) => name in scripts)
		.map((name) => `| \`${pnpmCommand(name)}\` | \`${scripts[name]}\` | ${holocronEquivalent(name)} |`);
	return `| Script | Command | Same as |\n|---|---|---|\n${rows.join("\n")}`;
}

function generateReleases(homepage: string): string {
	const base = homepage.replace(/\/$/, "");
	return `Automated via [semantic-release](https://semantic-release.gitbook.io/semantic-release/).\nSee the [releases page](${base}/releases) and [CHANGELOG.md](./CHANGELOG.md).`;
}
