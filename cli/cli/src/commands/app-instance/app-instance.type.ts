/** Where an app's deployment target goes (spec `tech-sentinel-preview-instance`). */
export interface AppInstance {
	/** The deployment project the target is written to. */
	project: string;
	/** The domain the project must serve, when the config names one. */
	domain?: string;
	/** Whether the deployment is made as the project's production target (a project of its own holds nothing else). */
	production: boolean;
	/** Whether the staged `vercel.json` leaves its `crons` out, because this instance is not the one they belong to. */
	omitCrons: boolean;
}
