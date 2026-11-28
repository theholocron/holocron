import { validateConfig as defaultValidateConfig } from "../../../utils/validate-config/index.js";
import type { AreaLabelsConfig } from "../area-labels.type.js";
import type { ReadAreaConfigInput, ReadAreaConfigResult } from "./read-area-config.type.js";

/**
 * Reads `repo.labels` from the default-branch config of the repository the delivery is about (`.holocron/` area files
 * included, through `validateConfig`, so Sentinel sees what the CLI sees). Nothing throws for "not set up": no config,
 * a config that does not load, or one with no `repo.labels.areas` is a reason. No setting and no secret of its own.
 */
export async function readAreaConfig(input: ReadAreaConfigInput): Promise<ReadAreaConfigResult> {
	const validate = input.validateConfig ?? defaultValidateConfig;
	const validated = await validate({ client: input.client, repo: input.repo });
	if (validated.status !== "valid") {
		return { ok: false, reason: `${input.repo} has no usable holocron config (${validated.status})` };
	}
	const config = validated.config as { repo?: { labels?: Partial<AreaLabelsConfig> } };
	const labels = config.repo?.labels;
	if (!labels?.areas || Object.keys(labels.areas).length === 0) {
		return { ok: false, reason: `${input.repo} declares no repo.labels.areas` };
	}
	return { ok: true, areas: labels.areas, scopes: labels.scopes };
}
