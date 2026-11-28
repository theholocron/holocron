import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { Deployment } from "../../plugin/index.js";
import { previewConfigOf } from "../setup/preview-config-of.js";
import type { DeclaredProject } from "./doctor-workers.type.js";

/**
 * The deployment projects `holocron setup` makes: the preview project (and its domain) when the config carries a
 * preview configuration, otherwise one named like the repo, with the provider's own `domain` when it has one.
 */
export function declaredProjects(
	config: ResolvedHolocronConfig,
	deploy: Pick<Deployment, "domain">
): DeclaredProject[] {
	const preview = previewConfigOf(config);
	if (preview) return [{ project: preview.project, ...(preview.domain ? { hostname: preview.domain } : {}) }];
	return [{ project: config.name, ...(deploy.domain ? { hostname: deploy.domain } : {}) }];
}
