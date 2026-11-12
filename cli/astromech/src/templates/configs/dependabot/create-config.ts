import { createHeader } from "../../../utils/index.js";
import type { DependabotConfigOptions } from "./create-config.type.js";
import dependabotBody from "./dependabot.yml";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/dependabot/create-config.ts",
});

/** Where the npm entry's `groups:` begins. The `ignore:` block goes right before it (the first `groups:` is npm's). */
const NPM_GROUPS = "    groups:\n";

function ignoreBlock(names: readonly string[]): string {
	const entries = [...new Set(names)].sort().map((name) => `      - dependency-name: "${name}"\n`);
	return `    ignore:\n${entries.join("")}`;
}

/** The github-actions entry's one directory line, which `sources` widens to a list. */
const ACTIONS_DIRECTORY =
	'    directory: /\n    schedule:\n      interval: weekly\n    labels:\n      - dependencies\n    commit-message:\n      prefix: "chore(deps)"\n    groups:\n      all-actions:';

function directoriesBlock(sources: readonly string[]): string {
	const entries = ["/", ...new Set(sources)].map((dir) => `      - ${dir}\n`);
	return `    directories:\n${entries.join("")}`;
}

/**
 * The content of `.github/dependabot.yml`, with its generated-file header. Names in `ignore` get a name-only
 * `ignore` entry on the npm ecosystem, and `sources` are watched next to `/` (`.github/workflows`) by the
 * github-actions one; with neither, the file is the shared body unchanged.
 */
export function createConfig({ ignore = [], sources = [] }: DependabotConfigOptions = {}): string {
	let body = dependabotBody;
	if (ignore.length > 0) body = body.replace(NPM_GROUPS, `${ignoreBlock(ignore)}${NPM_GROUPS}`);
	if (sources.length > 0) {
		const rest = ACTIONS_DIRECTORY.slice("    directory: /\n".length);
		body = body.replace(ACTIONS_DIRECTORY, `${directoriesBlock(sources)}${rest}`);
	}
	return `${workflowHeader()}${body}`;
}
