import type { TemplateInputs } from "../template-inputs.js";

export function render(_inputs: TemplateInputs): string {
	return `import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: false,
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "json-summary"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/__tests__/**", "src/**/*.test.ts", "src/index.ts"],
			thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
		},
	},
});
`;
}
