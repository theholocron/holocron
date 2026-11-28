import { BUILTIN_TEMPLATES, type RawProvidersConfig, resolveEntry, resolveProjectOptions } from "@theholocron/cli";
import { GitHubProjects } from "@theholocron/holocron-plugin-github";

import { validateConfig } from "../../../utils/validate-config/index.js";
import type {
	BoardStatusFactories,
	DeclaredBoard,
	LoadBoardStatusInput,
	LoadBoardStatusResult,
} from "./load-board-status.type.js";

/** The real providers: the config of the one configured repo, and GitHub Projects over the installation's client. */
export const DEFAULT_BOARD_FACTORIES: BoardStatusFactories = {
	validateConfig,
	createProjects: (client, repo) => new GitHubProjects(client.graphql, { repo }),
};

/**
 * Builds the `projects` provider for the board handler and reads the boards the config declares, or says why it cannot.
 *
 * Like the feed's loader and from the same setting: the declaration is read from the default branch of
 * `SENTINEL_REPO` (`.holocron/` area files included, through `validateConfig`), and the provider is GitHub's,
 * made over the installation's own client, so no secret of its own is needed (the App's organization projects
 * permission does the writing). Nothing throws for "not set up": a missing setting, another organisation, a config that
 * does not load, no `github` projects provider or no usable board is a reason. A template that is not a built-in is
 * left out of the boards (Sentinel does not fetch a repo's own template files), so its board is never touched.
 */
export async function loadBoardStatus(input: LoadBoardStatusInput): Promise<LoadBoardStatusResult> {
	const { client, env, repo } = input;
	const factories = input.factories ?? DEFAULT_BOARD_FACTORIES;
	const org = repo.split("/")[0];

	const home = env.SENTINEL_REPO;
	if (!home) return { ok: false, reason: "board status is off: SENTINEL_REPO is not set" };
	if (home.split("/")[0].toLowerCase() !== org.toLowerCase()) {
		return { ok: false, reason: `board status is configured for ${home}, not for the ${org} organisation` };
	}

	const validated = await factories.validateConfig({ client, repo: home });
	if (validated.status !== "valid") {
		return { ok: false, reason: `${home} has no usable holocron config (${validated.status})` };
	}
	const config = validated.config as { providers?: RawProvidersConfig; org?: string };
	const raw = config.providers?.projects;
	if (!raw) return { ok: false, reason: `${home} declares no projects provider` };
	const resolved = resolveEntry("projects", raw);
	// `projects` takes exactly one provider, so an entry always resolves to a single tuple.
	const { tuple } = resolved as Extract<typeof resolved, { cardinality: "single" }>;
	if (tuple.provider !== "github") {
		return { ok: false, reason: `the ${tuple.provider} projects provider is not one Sentinel drives` };
	}
	const options = resolveProjectOptions(tuple.options, config.org ?? org);
	if (!options.ok) return { ok: false, reason: `providers.projects is not valid: ${options.problems.join("; ")}` };

	const boards: DeclaredBoard[] = [];
	for (const declared of options.options.boards) {
		const template = BUILTIN_TEMPLATES[declared.template];
		if (template) boards.push({ name: declared.name, template });
	}
	if (boards.length === 0) return { ok: false, reason: `${home} declares no board with a built-in template` };

	return { ok: true, projects: factories.createProjects(client, repo), owner: options.options.owner, boards };
}
