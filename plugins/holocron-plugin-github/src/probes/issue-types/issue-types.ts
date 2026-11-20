import type { Probe } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { isRateLimited } from "../../capabilities/issues-sync.js";
import { runBackfill } from "./backfill.js";
import type { AreaConfig, BackfillApi } from "./issue-types.type.js";
import { parseArgs } from "./parse-args.js";

/** What the probe is built from: how to reach the provider, and the area declaration of `repo.labels`. */
export interface IssueTypesProbeContext {
	/** Builds the reads and writes; resolves the tokens, so it throws when one is not configured. */
	makeApi: () => BackfillApi;
	/** `repo.labels`, handed to the plugin by the loader; empty when the repo declares none. */
	areas: AreaConfig;
}

/**
 * `holocron probe github issue-types`: the one-time backfill of spec `tech-github-area-labels` (rollout item 5), a writer
 * the maintainer runs. It sets the Type of an issue from its kind labels, adds `area:<name>` labels, fills a milestone
 * and a project where a source exists, and ends with the list of every issue it read that still lacks a project, a
 * milestone, a Priority or an Effort. See `backfill.ts` for the rules. Run it with `--dry-run` first.
 *
 * Not verified against the live API: writing an issue's Type, adding an issue to a project, and the endpoints that read an
 * issue's field values and parent.
 */
export function issueTypesProbe(ctx: IssueTypesProbeContext): Probe {
	return {
		summary:
			"Backfill issues: set Type from the kind labels, add area labels, fill milestone and project where a source exists, and list what still lacks a project, milestone, Priority or Effort. Never overwrites a value. Run with --dry-run first.",
		writes: true,
		async run(probe) {
			const parsed = parseArgs(probe.args ?? []);
			if (!parsed.ok) {
				probe.say({ status: "fail", label: "arguments", detail: parsed.message });
				return;
			}
			try {
				await runBackfill({
					ctx: probe,
					api: ctx.makeApi(),
					options: parsed.options,
					areas: ctx.areas,
					isRateLimited,
				});
			} catch (err) {
				probe.say({ status: "fail", label: "issue-types", detail: errorMessage(err) });
			}
		},
	};
}
