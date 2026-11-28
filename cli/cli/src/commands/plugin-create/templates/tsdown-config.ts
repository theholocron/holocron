import type { TemplateInputs } from "../template-inputs/index.js";

/**
 * Per-package tsdown config. Only written when the target workspace has no
 * repo-root `tsdown.config.ts` (tsdown finds that one by walking up from the
 * package directory); see `plugin-create/index.ts`.
 */
export function render(_inputs: TemplateInputs): string {
	return `export { default } from "@theholocron/tsdown-config/presets/library";
`;
}
