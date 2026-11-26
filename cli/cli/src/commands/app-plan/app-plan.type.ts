import type { ResolvedTuple } from "../../config/index.js";

/** What an app's config says there is to deploy or sync. */
export interface AppPlan {
	/** The `deployment` provider (Vercel, for Sentinel). */
	deployment?: ResolvedTuple;
	/** The `workers` provider (Cloudflare, for Comlink). */
	workers?: ResolvedTuple;
	/** Whether `repo.secrets.deploy` names any secret for a deployment or Worker to receive. */
	deployKeys: boolean;
}
