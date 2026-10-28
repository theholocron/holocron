/**
 * `holocron monitoring run-resolved <url>` — runs an already-resolved
 * check list (no `holocron.config.ts` loading at all) against `url`
 * (holocron#1030/#1032 review).
 *
 * The trusted half of the `delivery.previewCheck` split, paired with
 * `monitoring resolve-checks` (the untrusted half, which loads config).
 * Safe to run with a credential present, since nothing here executes
 * PR-authored code — but a credential is only ever attached after
 * `verifyVercelDeploymentProject` confirms `url` actually belongs to
 * `vercelProject`: a URL merely ending in `.vercel.app` proves nothing,
 * since anyone can register their own Vercel project (sourcery review
 * on holocron#1032). No `vercelProject` given at all → the credential
 * is never attached, regardless of whether one is configured.
 */

import { verifyVercelDeploymentProject } from "../../plugin/index.js";
import type { MonitoringCheckReport } from "../monitoring-check/index.js";
import { reportChecks } from "../monitoring-check/index.js";
import type { ResolveVercelBypassHeadersInput, RunMonitoringRunResolvedInput } from "./monitoring-run-resolved.type.js";

/**
 * The shared gate every caller that might attach the Deployment
 * Protection bypass header goes through — `monitoring check`'s direct
 * CLI invocation included (sourcery review on holocron#1032 called this
 * out explicitly: verifying only in `delivery.previewCheck`'s own split
 * commands and not here would leave the exact same unverified-host
 * problem reachable by hand). No `vercelProject` → never attach
 * anything, regardless of whether a `bypassSecret` happens to be
 * configured. `vercelProject` given but verification fails or no token
 * is available → `undefined` AND a printed reason, never a thrown
 * error — callers decide for themselves whether that's fatal.
 */
export async function resolveVercelBypassHeaders(
	input: ResolveVercelBypassHeadersInput
): Promise<{ headers?: Record<string, string>; verified: boolean }> {
	const print = input.print ?? ((line: string) => console.log(line));
	if (!input.vercelProject) return { verified: true };

	if (!input.vercelToken) {
		print(`✗ --vercel-project was given but no Vercel token is available to verify deployment ownership`);
		return { verified: false };
	}
	const verify = input.verify ?? verifyVercelDeploymentProject;
	const verified = await verify(input.url, input.vercelProject, input.vercelToken, {
		...(input.vercelTeamId ? { teamId: input.vercelTeamId } : {}),
	});
	if (!verified) {
		print(
			`✗ ${input.url} does not resolve to a deployment of Vercel project "${input.vercelProject}" — refusing to attach the Deployment Protection bypass credential or run checks against an unverified URL`
		);
		return { verified: false };
	}
	return input.bypassSecret
		? { verified: true, headers: { "x-vercel-protection-bypass": input.bypassSecret } }
		: { verified: true };
}

export async function runMonitoringRunResolved(input: RunMonitoringRunResolvedInput): Promise<MonitoringCheckReport> {
	const { headers, verified } = await resolveVercelBypassHeaders(input);
	if (!verified) return { status: "fail", checks: [] };

	return reportChecks({
		checks: input.checks,
		url: input.url,
		...(headers ? { headers } : {}),
		...(input.print ? { print: input.print } : {}),
		...(input.logger ? { logger: input.logger } : {}),
		...(input.runCheck ? { runCheck: input.runCheck } : {}),
	});
}
