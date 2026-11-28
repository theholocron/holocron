import { detectEnvironment } from "@theholocron/env-utils/lookup";

import { derivesEnvironment } from "../derives-environment/index.js";
import { type EnvironmentCandidate, environmentLayers } from "../environment-layers/index.js";
import { repoSlug } from "../repo-slug/index.js";
import type { ResolveEnvironmentsInput } from "./resolve-environments.type.js";

/**
 * The Environments one `credentials` entry reads. An explicit name (the entry's `environment` option, else the shared
 * `credentials.environment`) is the only candidate and wins. Otherwise a deriving provider gets the names of its layer
 * (`environmentLayers()`) from the repo's `origin` and `detectEnvironment()`. Nothing is read from a provider here. An empty list means there is nothing to read (the `test` layer).
 */
export async function resolveEnvironments(
	provider: string,
	explicit: string | undefined,
	input: ResolveEnvironmentsInput
): Promise<EnvironmentCandidate[]> {
	if (explicit !== undefined) return [{ name: explicit, optional: false }];
	if (!derivesEnvironment(provider)) return [];
	const layer = detectEnvironment(input.env);
	if (layer === "test") return [];
	return environmentLayers(await repoSlug(input.repoRoot, input.gitExec), layer);
}
