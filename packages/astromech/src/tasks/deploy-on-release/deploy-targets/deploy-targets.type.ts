import type { WorkspacePackage } from "../workspace-packages/index.js";

/** One package's release-time deploy, resolved from its manifest. */
export interface DeployTarget {
	pkg: WorkspacePackage;
	channel: string;
	/** Explicit `with.paths`, when the manifest sets them. */
	paths: string[] | undefined;
}
