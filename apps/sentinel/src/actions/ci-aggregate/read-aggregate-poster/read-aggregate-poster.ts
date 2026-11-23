import { aggregatePoster } from "@theholocron/astromech";

import { validateConfig as defaultValidateConfig } from "../../../utils/validate-config/index.js";
import type { ReadAggregatePosterInput, ReadAggregatePosterResult } from "./read-aggregate-poster.type.js";

/** How long a read is reused. A commit's config never changes, so this only bounds the memory of a warm instance. */
export const AGGREGATE_POSTER_TTL_MS = 5 * 60_000;

const processCache = new Map<string, { at: number; value: ReadAggregatePosterResult }>();

/**
 * Who posts `ci / Required checks` for one commit: the `ci.aggregate` its own config declares (`actions` when it declares
 * none), read at the pull request's **head**, because the setting has to match the workflow files that run for that
 * commit (SPEC-0099: one poster per commit). The list of checks to wait for is read at the base instead, so a pull
 * request cannot shrink its gate. A head read is used only to decide which name to post under, never to write persistent
 * state, which is the boundary `validateConfig()` documents for a ref-based read. A commit with no usable config answers
 * `actions` and says why, so a broken head never makes Sentinel post the real check.
 */
export async function readAggregatePoster(input: ReadAggregatePosterInput): Promise<ReadAggregatePosterResult> {
	const cache = input.cache ?? processCache;
	const now = input.now ?? Date.now();
	const key = `${input.repo}@${input.sha}`;
	const hit = cache.get(key);
	if (hit !== undefined && now - hit.at < AGGREGATE_POSTER_TTL_MS) return hit.value;

	const validate = input.validateConfig ?? defaultValidateConfig;
	const validated = await validate({ client: input.client, repo: input.repo, ref: input.sha });
	const value: ReadAggregatePosterResult =
		validated.status === "valid"
			? { poster: aggregatePoster(validated.config) }
			: {
					poster: "actions",
					reason: `${input.repo}@${input.sha} has no usable holocron config (${validated.status})`,
				};
	cache.set(key, { at: now, value });
	return value;
}
