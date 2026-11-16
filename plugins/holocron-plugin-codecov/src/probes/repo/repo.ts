import type { CoverageRepoReport, Probe } from "@theholocron/cli";

import { parseTokenArgs } from "../token/parse-token-args.js";
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
 *
 * It accepts `--environment <layer or name>` like the `token` probes: the CLI runs it once per Codecov token the
 * Environment holds and passes `--token-name <VARIABLE>`. For `HOLOCRON_CODECOV_API_TOKEN` the probe checks with that
 * token; for any other (the upload token) it says it does not check it. A bare `--token`, which is the upload token for
 * this plugin, is never used here and the probe says so.
 */
export function repoProbe(ctx: RepoProbeContext): Probe {
	return {
		summary:
			"Compare the flags and components `holocron sync` writes to codecov.yml with the ones Codecov has for the repository. Needs HOLOCRON_CODECOV_API_TOKEN (a personal API token). Read-only.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			const { tokenName } = parseTokenArgs(probe.args ?? []);
			if (tokenName !== undefined && tokenName !== ctx.apiTokenName) {
				probe.say({
					status: "info",
					label: tokenName,
					detail: `not the API token (${ctx.apiTokenName}), so this probe does not check it`,
				});
				return;
			}
			let apiToken: string | undefined;
			if (tokenName !== undefined) {
				apiToken = ctx.cliToken;
				if (apiToken !== undefined) probe.secret(apiToken);
			} else if (ctx.cliToken !== undefined) {
				probe.say({
					status: "info",
					label: "--token",
					detail: `a token given with --token is the upload token, which the REST API does not take, so it is not used; use --environment for ${ctx.apiTokenName}`,
				});
			}
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
				report = await ctx.coverage(apiToken).checkRepo?.(ctx.expected());
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
