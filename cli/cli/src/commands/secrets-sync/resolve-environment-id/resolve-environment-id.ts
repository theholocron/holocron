import type { GitExec } from "@theholocron/git-utils";

import { isEnvironmentLayer, layerEnvironment, repoSlug } from "../../../credentials-environments/index.js";

/**
 * The vault Environment `holocron sync secrets --env <environment>` reads. A layer word (`local`, `dev`, `ci`, `prod`) is the
 * Environment of that layer of this repository, `<org/repo> - <layer>`; any other text is a literal Environment name.
 * A literal name wins only when it is not exactly a layer word, so an Environment that is itself called `prod` cannot be
 * addressed by that name (spec `tech-environment-layers`, #2069).
 *
 * @param id - The `--env` value the user gave.
 * @param input - Where the repository is (its `origin` remote is read there), and optionally how to read it.
 * @throws {ConfigError} For a layer word when the remote cannot be read (the message names the `environment` option).
 */
export async function resolveEnvironmentId(
	id: string,
	input: { repoRoot: string; gitExec?: GitExec }
): Promise<string> {
	if (!isEnvironmentLayer(id)) return id;
	return layerEnvironment(await repoSlug(input.repoRoot, input.gitExec), id);
}
