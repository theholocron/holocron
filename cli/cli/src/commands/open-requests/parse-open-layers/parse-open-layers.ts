import { ConfigError } from "@theholocron/kyber/config";

import type { OpenLayer } from "./parse-open-layers.type.js";

/**
 * The layers `open requests` can fill, in the order they are listed. `ci` and `test` are left out on purpose: the request
 * tool is a person at a machine, and neither layer is one it signs requests for.
 */
export const OPEN_LAYERS: readonly OpenLayer[] = ["local", "dev", "prod"];

/** The layer loaded when `--environment` is not given. `prod` is never a default. */
export const DEFAULT_OPEN_LAYER: OpenLayer = "dev";

/**
 * Turns the `--environment` values into the layers to load. Each value may itself be a comma-separated list, so
 * `--environment dev,local` and `--environment dev --environment local` mean the same. Duplicates are collapsed, spaces
 * around a name are ignored, and the result is in {@link OPEN_LAYERS} order whatever order was typed. With no value the
 * result is `dev` alone.
 *
 * @param values - The raw `--environment` values, or `undefined` when the flag was not given.
 * @throws {ConfigError} For a name that is not one of {@link OPEN_LAYERS}, or an empty one; the message lists the allowed ones.
 */
export function parseOpenLayers(values: readonly string[] | undefined): OpenLayer[] {
	if (!values || values.length === 0) return [DEFAULT_OPEN_LAYER];
	const names = values.flatMap((value) => value.split(",").map((name) => name.trim()));
	const unknown = [...new Set(names.filter((name) => !(OPEN_LAYERS as readonly string[]).includes(name)))];
	if (unknown.length > 0) {
		const shown = unknown.map((name) => (name === "" ? "(empty)" : JSON.stringify(name))).join(", ");
		throw new ConfigError(
			`--environment does not know ${shown}: use ${OPEN_LAYERS.join(", ")}, comma-separated or repeated`
		);
	}
	return OPEN_LAYERS.filter((layer) => names.includes(layer));
}
