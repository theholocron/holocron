import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { SyncFeed } from "./doctor-variable-owners.type.js";

/** The GitHub Environments whose secrets are listed: the ones `repo.secrets.environments` and a sync entry name. */
export function githubEnvironments(config: ResolvedHolocronConfig, feeds: SyncFeed[]): string[] {
	const prefix = "secrets:env=";
	const fromSync = feeds.filter((f) => f.target.startsWith(prefix)).map((f) => f.target.slice(prefix.length));
	return [...new Set([...Object.keys(config.repo?.secrets?.environments ?? {}), ...fromSync])];
}
