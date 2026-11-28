import type { CoverageConfigInput } from "@theholocron/cli";

import { createCodecovConfig, mergeCodecovComponents } from "../config-file/codecov-config.js";

/** The one file Codecov reads its flags, components and statuses from, relative to the repository root. */
export const CODECOV_CONFIG_FILE = "codecov.yml";

/**
 * The config files Codecov needs, as text by path. `codecov.yml` is merged into the copy already in the repo (every
 * hand edit kept) or, with none, scaffolded. Pure: the existing text comes in through `input.existing`, nothing is read
 * or written here.
 */
export function configFiles(input: CoverageConfigInput): Record<string, string> {
	const options = { flags: input.flags, documentation: input.documentation };
	const existing = input.existing(CODECOV_CONFIG_FILE);
	return {
		[CODECOV_CONFIG_FILE]:
			existing === null
				? createCodecovConfig(input.components, options)
				: mergeCodecovComponents(existing, input.components, options),
	};
}
