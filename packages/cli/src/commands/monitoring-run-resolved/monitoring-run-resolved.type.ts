import type { Logger } from "@theholocron/observability/core";

import type { MonitoringCheckInput, runCheckAgainstUrl, verifyVercelDeploymentProject } from "../../plugin/index.js";
import type { MonitoringCheckPrint } from "../monitoring-check/index.js";

export interface RunMonitoringRunResolvedInput {
	checks: MonitoringCheckInput[];
	url: string;
	/** Expected Vercel project id/name `url` must resolve to before the bypass credential is attached. Omit to never attach it. */
	vercelProject?: string;
	/** Required to verify project ownership when `vercelProject` is given. */
	vercelToken?: string;
	vercelTeamId?: string;
	/** Attached as the `x-vercel-protection-bypass` header, but only once `vercelProject` verification passes. */
	bypassSecret?: string;
	print?: MonitoringCheckPrint;
	logger?: Logger;
	/** Injectable for testing. Defaults to the real HTTP-driven evaluator. */
	runCheck?: typeof runCheckAgainstUrl;
	/** Injectable for testing. Defaults to the real Vercel API call. */
	verify?: typeof verifyVercelDeploymentProject;
}

export interface ResolveVercelBypassHeadersInput {
	url: string;
	vercelProject?: string;
	vercelToken?: string;
	vercelTeamId?: string;
	bypassSecret?: string;
	print?: MonitoringCheckPrint;
	verify?: typeof verifyVercelDeploymentProject;
}
