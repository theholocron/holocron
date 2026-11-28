import type { Probe } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { isRateLimited } from "../../capabilities/issues-sync.js";
import { runBackfill } from "./backfill.js";
import type { BackfillApi, LabelsConfig } from "./issue-types.type.js";
import { resolveKinds } from "./kinds.js";
import { parseArgs } from "./parse-args.js";
import { readRepoAreas } from "./repo-areas.js";

/** What the probe is built from: how to reach the provider, this repository and the `repo.labels` of its config. */
export interface IssueTypesProbeContext {
	/** Builds the reads and writes for a repository; resolves the tokens, so it throws when one is not configured. */
	makeApi: (repo: string) => BackfillApi;
	/** This repository (`owner/name`): the default, whose areas are the config's own. */
	repo: string;
	/** `repo.labels`, handed to the plugin by the loader; empty when the repo declares none. */
	config: LabelsConfig;
}

/**
 * `holocron probe github issue-types`: the one-time backfill of spec `tech-github-area-labels` (rollout item 5), a writer
 * the maintainer runs. It sets the Type of an issue from its kind labels, adds `area:<name>` labels, fills a milestone
 * and a project where a source exists, and ends with the list of every issue it read that still lacks a project, a
 * milestone, a Priority or an Effort. See `backfill.ts` for the rules. Run it with `--dry-run` first.
 *
 * The kind labels and the repositories come from `repo.labels` (`kinds`, `fallbackKinds`, `repos`) and `--repo`, and a
 * repository other than this one has its area labels read from its own `.holocron/repo.json` (spec
 * `tech-backfill-config-mapping`).
 *
 * Not verified against the live API: writing an issue's Type, adding an issue to a project, reading the organization's
 * issue Types, and the endpoints that read an issue's field values and parent.
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
			const named = parsed.options.repos;
			const repos = named.length > 0 ? named : ctx.config.repos?.length ? ctx.config.repos : [ctx.repo];
			const kinds = resolveKinds(ctx.config);
			for (const repo of repos) {
				if (repos.length > 1) probe.say({ status: "heading", label: repo });
				try {
					const api = ctx.makeApi(repo);
					let areas = ctx.config;
					if (repo.toLowerCase() !== ctx.repo.toLowerCase()) {
						const found = await readRepoAreas(api);
						probe.say(found.row);
						areas = found.areas;
					}
					await runBackfill({
						ctx: probe,
						api,
						options: { ...parsed.options, repo: named.length > 0 || repos.length > 1 ? repo : undefined },
						areas,
						kinds,
						isRateLimited,
					});
				} catch (err) {
					probe.say({ status: "fail", label: "issue-types", detail: errorMessage(err) });
				}
			}
		},
	};
}
