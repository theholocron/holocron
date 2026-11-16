import type { CoverageRepoReport, Probe } from "@theholocron/cli";

import type { RepoProbeContext } from "./repo.type.js";

/**
 * The `repo` probe for Codecov: compares the flags and components `holocron sync` writes to `codecov.yml` with the ones
 * Codecov has for the repository, through `coverage.checkRepo()`. One row per difference, `ok` per list that matches.
 *
 * - a **component** declared but missing on Codecov is a `fail`: `codecov.yml` has not reached the default branch, or
 *   Codecov has not read it;
 * - a **flag** declared but missing is `info`: Codecov only knows a flag once an upload carried it, so a package with no
 *   tests yet has none;
 * - anything on Codecov the config does not declare is `info`: a hand-made or retired name.
 *
 * Codecov's REST API takes a personal API token, not the upload token, so without `HOLOCRON_CODECOV_API_TOKEN` the probe
 * reports `info` naming the variable and never fails. It only reads.
 */
export function repoProbe(ctx: RepoProbeContext): Probe {
	return {
		summary:
			"Compare the flags and components `holocron sync` writes to codecov.yml with the ones Codecov has for the repository. Needs HOLOCRON_CODECOV_API_TOKEN (a personal API token). Read-only.",
		writes: false,
		async run(probe) {
			if (!ctx.repo) {
				probe.say({
					status: "info",
					label: "repository",
					detail: "none to ask Codecov about: set the plugin options owner and repo",
				});
				return;
			}
			let report: CoverageRepoReport | undefined;
			try {
				report = await ctx.coverage().checkRepo?.(ctx.expected());
			} catch (err) {
				probe.say({
					status: "fail",
					label: "Codecov API",
					detail: err instanceof Error ? err.message : String(err),
				});
				return;
			}
			if (!report) {
				probe.say({
					status: "info",
					label: "Codecov API",
					detail: "the coverage provider has no repository check",
				});
				return;
			}
			if (!report.checked) {
				probe.say({ status: "info", label: "Codecov API", detail: report.reason ?? "not checked" });
				return;
			}
			const lists = [
				{ kind: "component", diff: report.components, missing: "fail" as const },
				{ kind: "flag", diff: report.flags, missing: "info" as const },
			];
			for (const { kind, diff, missing } of lists) {
				for (const name of diff.missing) {
					probe.say({
						status: missing,
						label: `${kind} ${name}`,
						detail:
							kind === "flag"
								? "declared in the config, not on Codecov (no upload has carried it yet)"
								: "declared in the config, not on Codecov (codecov.yml not on the default branch yet?)",
					});
				}
				for (const name of diff.extra) {
					probe.say({
						status: "info",
						label: `${kind} ${name}`,
						detail: "on Codecov, not declared in the config",
					});
				}
				if (diff.missing.length === 0 && diff.extra.length === 0) {
					probe.say({
						status: "ok",
						label: `${kind}s`,
						detail: `${diff.expected.length} declared, all on Codecov for ${ctx.repo}`,
					});
				}
			}
		},
	};
}
