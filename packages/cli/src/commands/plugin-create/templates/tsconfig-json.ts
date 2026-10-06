import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	return (
		JSON.stringify(
			{
				display: `Holocron Plugin: ${inputs.vendorName}`,
				extends: "@theholocron/tsconfig/node-lts",
				compilerOptions: {
					baseUrl: "./",
					outDir: "./dist",
					paths: { "@/*": ["./src/*"] },
				},
				include: ["src/**/*.ts"],
				exclude: ["node_modules", "dist"],
			},
			null,
			2
		) + "\n"
	);
}
