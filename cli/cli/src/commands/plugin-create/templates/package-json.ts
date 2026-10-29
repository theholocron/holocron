import type { TemplateInputs } from "../template-inputs/index.js";

export function render(inputs: TemplateInputs): string {
	const keywords = [inputs.capability, "holocron", "plugin", inputs.slug].sort((a, b) => a.localeCompare(b));
	return (
		JSON.stringify(
			{
				name: `@theholocron/holocron-plugin-${inputs.slug}`,
				version: "2.0.0-alpha.1",
				description: `Holocron plugin for ${inputs.vendorName}. Implements the ${inputs.capability} capability against ${inputs.vendorName}'s REST API, plus exports verifyToken + AUTH_HINT for \`holocron auth\`.`,
				keywords,
				homepage: `https://github.com/theholocron/holocron/tree/main/plugins/holocron-plugin-${inputs.slug}#readme`,
				bugs: "https://github.com/theholocron/holocron/issues",
				repository: {
					type: "git",
					url: "git+https://github.com/theholocron/holocron.git",
					directory: `plugins/holocron-plugin-${inputs.slug}`,
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
				files: ["dist"],
				scripts: {
					// Each task calls its tool directly, like every other package in
					// the repo (no `holocron run` indirection).
					"delivery.build": "tsdown",
					"sourceQuality.staticAnalysis": "eslint .",
					"test:watch": "vitest",
					validate: "tsx scripts/validate.mjs",
					"verification.typeSafety": "tsc --noEmit",
					"verification.unitTests": "vitest run",
				},
				devDependencies: {
					"@theholocron/cli": "workspace:*",
					"@theholocron/eslint-config": "catalog:configs",
					"@theholocron/http-client": "workspace:^",
					"@theholocron/misc-utils": "workspace:^",
					"@theholocron/tsconfig": "workspace:^",
					// Kept even though the build config lives at the repo root: the
					// root config imports this preset's dist, and the devDependency is
					// what makes turbo build the preset first (`^delivery.build`).
					"@theholocron/tsdown-config": "workspace:^",
					"@theholocron/vitest-config": "workspace:^",
					"@types/node": "catalog:",
					"@vitest/coverage-v8": "catalog:",
					"@vitest/eslint-plugin": "catalog:",
					eslint: "catalog:",
					"eslint-plugin-n": "catalog:",
					globals: "catalog:",
					tsdown: "catalog:",
					tsx: "catalog:",
					typescript: "catalog:",
					vitest: "catalog:",
				},
				peerDependencies: { "@theholocron/cli": "workspace:*", "@theholocron/misc-utils": "catalog:utils" },
				engines: { node: ">=22" },
				publishConfig: { access: "public" },
			},
			null,
			2
		) + "\n"
	);
}
