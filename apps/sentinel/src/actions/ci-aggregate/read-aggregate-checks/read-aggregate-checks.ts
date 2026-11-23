import { aggregateChecks } from "@theholocron/astromech";

import { validateConfig as defaultValidateConfig } from "../../../utils/validate-config/index.js";
import type { ReadAggregateChecksInput, ReadAggregateChecksResult } from "./read-aggregate-checks.type.js";

/** How long a successful read is reused. A config merged a minute ago waits at most this long to take effect. */
export const AGGREGATE_CHECKS_TTL_MS = 5 * 60_000;

const processCache = new Map<string, { at: number; value: ReadAggregateChecksResult }>();

/**
 * The checks the `ci` aggregate waits on for a pull request: the repository's config at the pull request's **base**
 * branch, through `validateConfig` (so `.holocron/` area files count) and astromech's `aggregateChecks()`, the function
 * that writes the Actions caller's `expected`, so the two cannot drift. A branch read is safe here because nothing it
 * yields is written anywhere persistent. Only a success is cached; a repo with no usable config is a reason, not a throw.
 * Without plugins loaded, `aggregateChecks()` takes the `codecov/` prefix as the mark of a commit status.
 */
export async function readAggregateChecks(input: ReadAggregateChecksInput): Promise<ReadAggregateChecksResult> {
	const cache = input.cache ?? processCache;
	const now = input.now ?? Date.now();
	const key = `${input.repo}@${input.baseRef}`;
	const hit = cache.get(key);
	if (hit !== undefined && now - hit.at < AGGREGATE_CHECKS_TTL_MS) return hit.value;

	const validate = input.validateConfig ?? defaultValidateConfig;
	const validated = await validate({ client: input.client, repo: input.repo, ref: input.baseRef });
	if (validated.status !== "valid") {
		return {
			ok: false,
			reason: `${input.repo}@${input.baseRef} has no usable holocron config (${validated.status})`,
		};
	}
	const { expected, statuses } = aggregateChecks(validated.config);
	const value: ReadAggregateChecksResult = { ok: true, expected, statuses };
	cache.set(key, { at: now, value });
	return value;
}
