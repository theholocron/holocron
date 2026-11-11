import type { EnvironmentLayer } from "./layer-environment.type.js";

/** The layer words, in the order the docs list them. */
export const ENVIRONMENT_LAYERS: readonly EnvironmentLayer[] = ["local", "dev", "ci", "prod"];

/** Whether `value` is exactly one of the layer words (case-sensitive: `Prod` is a literal Environment name). */
export function isEnvironmentLayer(value: unknown): value is EnvironmentLayer {
	return typeof value === "string" && (ENVIRONMENT_LAYERS as readonly string[]).includes(value);
}

/**
 * The Environment a layer of a repository is kept in: `<org/repo> - <layer>`. The one place the name is built, for the
 * `credentials` providers (`environmentLayers()`) and for the config entries that name a `layer`.
 */
export function layerEnvironment(slug: string, layer: EnvironmentLayer): string {
	return `${slug} - ${layer}`;
}
