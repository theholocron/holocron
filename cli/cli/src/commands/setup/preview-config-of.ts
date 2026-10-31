import { extractPreviewConfig, type PreviewConfig } from "@theholocron/astromech";

import type { ResolvedHolocronConfig } from "../../config/index.js";

/**
 * The preview configuration (the Pages project and the preview domain) that drives project and DNS provisioning.
 * `delivery.deploy`, `knowledge.docs` and `knowledge.components` all share the same combined production and preview
 * mechanism, so any one of them can carry it. `null` when none does.
 */
export function previewConfigOf(config: ResolvedHolocronConfig): PreviewConfig | null {
	const entry = (config.tasks ?? [])
		.map((e) => (typeof e === "string" ? { name: e } : e))
		.find((e) => e.name === "delivery.deploy" || e.name === "knowledge.docs" || e.name === "knowledge.components");
	return entry?.with
		? extractPreviewConfig(entry.with as Record<string, unknown>, { org: config.org, domain: config.domain })
		: null;
}
