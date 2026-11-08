import type { ProviderRow } from "@theholocron/cli";

import type { LinearSetupConfig } from "./provider-config.js";
import { row } from "./rows.js";

/**
 * One skipped row per declared issue template. Linear's schema documents `templateData` only as "a JSON-encoded string
 * containing the pre-filled attributes", with no shape for an issue (and `Template.content`, the markdown, is read-only),
 * so a template cannot be written from a markdown file, nor read back and compared, with certainty. The declaration is
 * validated and listed; the template is made in Linear: Settings → Templates.
 */
export function templateRows(config: LinearSetupConfig): ProviderRow[] {
	return config.templates.map((t) =>
		row(
			`template:${t.name}`,
			`template ${t.name}`,
			"skip",
			`${t.file}: not applied or compared (Linear does not document the issue templateData shape); make it in Settings → Templates`
		)
	);
}
