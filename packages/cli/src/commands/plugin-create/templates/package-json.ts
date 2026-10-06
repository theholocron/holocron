import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const keywords = [inputs.capability, "holocron", "plugin", inputs.slug].sort((a, b) => a.localeCompare(b));
	return (
		JSON.stringify(
			{
				name: `@theholocron/holocron-plugin-${inputs.slug}`,
				version: "2.0.0-alpha.1",
				description: `Holocron plugin for ${inputs.vendorName}. Implements the ${inputs.capability} capability against ${inputs.vendorName}'s REST API, plus exports verifyToken + AUTH_HINT for \`holocron auth\`.`,
				keywords,
				homepage: `https://github.com/theholocron/holocron/tree/main/packages/holocron-plugin-${inputs.slug}#readme`,
				bugs: "https://github.com/theholocron/holocron/issues",
				repository: {
					type: "git",
					url: "git+https://github.com/theholocron/holocron.git",
					directory: `packages/holocron-plugin-${inputs.slug}`,
				},
				license: "MIT",
				author: "Newton Koumantzelis",
				sideEffects: false,
				type: "module",
				exports: {
					".": {
						types: "./dist/index.d.mts",
						import: "./dist/index.mjs",
						default: "./dist/index.mjs",
					},
				},
				scripts: {
					// delivery.build stays a direct tool invocation, never `holocron
					// run` — it's what produces the holocron binary, so it can never
					// depend on holocron already existing. The other three tasks are
					// safe to gateway through holocron: this template already
					// declares @theholocron/cli as a real devDependency below, giving
					// turbo the edge it needs to build cli (and transitively
					// astromech) before this package's own script ever runs.
					"delivery.build": "tsdown",
					"sourceQuality.staticAnalysis": "holocron run sourceQuality.staticAnalysis --",
					"verification.typeSafety": "holocron run verification.typeSafety --",
					"verification.unitTests": "holocron run verification.unitTests --",
					"test:watch": "vitest",
					validate: "tsx scripts/validate.mjs",
				},
				peerDependencies: { "@theholocron/cli": "workspace:*" },
				devDependencies: {
					"@theholocron/cli": "workspace:*",
					"@theholocron/tsconfig": "catalog:configs",
					"@types/node": "catalog:",
					"@vitest/coverage-v8": "catalog:",
					eslint: "catalog:",
					globals: "catalog:",
					tsdown: "catalog:",
					tsx: "catalog:",
					typescript: "catalog:",
					vitest: "catalog:",
				},
				engines: { node: ">=22" },
				publishConfig: { access: "public" },
				files: ["dist"],
			},
			null,
			2
		) + "\n"
	);
}
