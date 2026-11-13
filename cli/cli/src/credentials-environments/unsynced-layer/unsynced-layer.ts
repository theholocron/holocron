import type { GitExec } from "@theholocron/git-utils";
import { ConfigError } from "@theholocron/kyber/config";

import {
	ENVIRONMENT_LAYERS,
	type EnvironmentLayer,
	isEnvironmentLayer,
	layerEnvironment,
} from "../layer-environment/index.js";
import { repoSlug } from "../repo-slug/index.js";

/** The layers this machine reads for itself. They are never synced to GitHub, a deployment or a Worker (#2104). */
export const UNSYNCED_LAYERS: readonly EnvironmentLayer[] = ["local", "dev"];

/** Whether `layer` is one of {@link UNSYNCED_LAYERS}. */
export function isUnsyncedLayer(layer: unknown): layer is EnvironmentLayer {
	return isEnvironmentLayer(layer) && UNSYNCED_LAYERS.includes(layer);
}

/**
 * The text of the error for an Environment of an unsynced layer, shared by the command and the config checks.
 *
 * @param what - What names the layer, e.g. "`sync secrets --env dev`" or "a `repo.secrets.sync` entry".
 * @param layer - The unsynced layer.
 */
export function unsyncedLayerMessage(what: string, layer: EnvironmentLayer): string {
	const synced = ENVIRONMENT_LAYERS.filter((l) => !isUnsyncedLayer(l))
		.map((l) => `\`${l}\``)
		.join(" and ");
	return `${what} names the \`${layer}\` layer: \`local\` and \`dev\` are read by this machine and are never synced. Only ${synced} can be synced`;
}

/**
 * Refuse a sync of an unsynced layer, before anything is read. The argument is a layer word, or the literal name of a
 * layer's Environment (`<org/repo> - dev`, built by `layerEnvironment()` from the `origin` remote). A remote that
 * cannot be read means no literal name can be matched, so only a layer word is checked then.
 *
 * @param id - The environment as given on the command line.
 * @param input - Where the repository is, and optionally how to read its remote.
 * @throws {ConfigError} For an unsynced layer, whatever other flags are given.
 */
export async function assertSyncableLayer(id: string, input: { repoRoot: string; gitExec?: GitExec }): Promise<void> {
	if (isEnvironmentLayer(id)) {
		if (isUnsyncedLayer(id)) throw new ConfigError(unsyncedLayerMessage(`\`sync secrets --env ${id}\``, id));
		return;
	}
	// `repoSlug()` throws only a ConfigError (no usable remote); then there is no derived name to match.
	const slug = await repoSlug(input.repoRoot, input.gitExec).catch(() => undefined);
	if (slug === undefined) return;
	for (const layer of UNSYNCED_LAYERS) {
		if (id === layerEnvironment(slug, layer)) {
			throw new ConfigError(unsyncedLayerMessage(`\`sync secrets --env\` for ${JSON.stringify(id)}`, layer));
		}
	}
}
