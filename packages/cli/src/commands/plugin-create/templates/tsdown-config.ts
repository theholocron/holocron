import type { TemplateInputs } from "../template-inputs.js";

export function render(_inputs: TemplateInputs): string {
	return `import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	dts: true,
	clean: true,
	deps: { neverBundle: [/^@theholocron\\//] },
});
`;
}
