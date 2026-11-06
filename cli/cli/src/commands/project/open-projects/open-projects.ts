import { withSpinner } from "@theholocron/kyber/ui";
import { describeError } from "@theholocron/kyber/ui";

import { ConfigError } from "../../../config/index.js";
import { assertPluginsResolvable, PluginLoader } from "../../../plugin/index.js";
import { resolveProjectOptions } from "../project-options/index.js";
import type { OpenedProjects, ProjectRunInput } from "./open-projects.type.js";

/**
 * Load the `projects` provider and read its options. A config without `providers.projects`, a provider that did not
 * load and options that are wrong are each a {@link ConfigError} whose message says what to write.
 */
export async function openProjects(input: ProjectRunInput, command: string): Promise<OpenedProjects> {
	const entry = input.loaded.resolved.providers.projects;
	if (entry?.cardinality !== "single") {
		throw new ConfigError(
			`${command}: needs a \`projects\` provider in holocron.config.ts, e.g. providers: { projects: "github" }`
		);
	}

	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await withSpinner("Loading plugins…", () => loader.load());
	assertPluginsResolvable(loader, command);
	if (!loader.has("projects")) {
		const failure = loader.loadFailures().find((f) => f.key === "projects");
		throw new ConfigError(
			`${command}: the \`projects\` provider is not available${
				failure ? ` (\`${failure.provider}\` failed to load: ${describeError(failure.error)})` : ""
			}`
		);
	}

	const resolved = resolveProjectOptions(entry.tuple.options, input.owner ?? input.context.org ?? "");
	if (!resolved.ok) {
		throw new ConfigError(`${command}: providers.projects is wrong: ${resolved.problems.join("; ")}`);
	}
	if (resolved.options.owner === "") {
		throw new ConfigError(
			`${command}: needs an owner: set \`org\` in holocron.config.ts, the provider's \`org\` option, or pass --org`
		);
	}
	return { projects: loader.get("projects"), options: resolved.options };
}
