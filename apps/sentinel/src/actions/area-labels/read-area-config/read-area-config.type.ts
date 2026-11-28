import type { GitHubClient } from "@theholocron/github-client";

import type { ValidateConfigInput, ValidateConfigResult } from "../../../utils/validate-config/index.js";
import type { AreaLabelsConfig } from "../area-labels.type.js";

export interface ReadAreaConfigInput {
	client: GitHubClient;
	/** `owner/repo` the delivery is about: its own default-branch config declares its areas. */
	repo: string;
	/** Replaces the config reader, for tests. */
	validateConfig?: (input: ValidateConfigInput) => Promise<ValidateConfigResult>;
}

/** The declared areas, or why there are none (a repo that declares none is a normal state, not an error). */
export type ReadAreaConfigResult = ({ ok: true } & AreaLabelsConfig) | { ok: false; reason: string };
