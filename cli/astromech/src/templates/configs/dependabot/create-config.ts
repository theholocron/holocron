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

/**
 * The content of `.github/dependabot.yml`, with its generated-file header. Names in `ignore` get a name-only
 * `ignore` entry on the npm ecosystem; with none, the file is the shared body unchanged.
 */
export function createConfig({ ignore = [] }: DependabotConfigOptions = {}): string {
	const body =
		ignore.length === 0
			? dependabotBody
			: dependabotBody.replace(NPM_GROUPS, `${ignoreBlock(ignore)}${NPM_GROUPS}`);
	return `${workflowHeader()}${body}`;
}
