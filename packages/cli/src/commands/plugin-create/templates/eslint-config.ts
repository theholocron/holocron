import type { TemplateInputs } from "../template-inputs.js";

export function render(_inputs: TemplateInputs): string {
	return `import root from "../../eslint.config.js";

export default [
	...root,
	{
		ignores: ["dist/**", "coverage/**"],
	},
];
`;
}
