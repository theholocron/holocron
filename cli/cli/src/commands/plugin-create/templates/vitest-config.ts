import type { TemplateInputs } from "../template-inputs/index.js";

export function render(_inputs: TemplateInputs): string {
	return `export { default } from "@theholocron/vitest-config/bundles/library";
`;
}
