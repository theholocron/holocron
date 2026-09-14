import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	return (
		JSON.stringify(
			{
				name: `@theholocron/holocron-plugin-${inputs.slug}`,
				version: "2.0.0-alpha.1",
				description: `Holocron plugin for ${inputs.vendorName}. Implements the ${inputs.capability} capability against ${inputs.vendorName}'s REST API, plus exports verifyToken + AUTH_HINT for \`holocron auth\`.`,
				homepage: `https://github.com/theholocron/holocron/tree/main/packages/holocron-plugin-${inputs.slug}#readme`,
				bugs: "https://github.com/theholocron/holocron/issues",
				repository: {
					type: "git",
					url: "git+https://github.com/theholocron/holocron.git",
					directory: `packages/holocron-plugin-${inputs.slug}`,
				},
				license: "MIT",
				author: "Newton Koumantzelis",
				type: "module",
				main: "./src/index.ts",
				exports: { ".": "./src/index.ts" },
				scripts: {
					// Direct tool invocations, not `holocron run <task>` — this repo
					// carries @theholocron/cli as workspace:*, and pnpm creates each
					// package's node_modules/.bin/holocron symlink once, during the
					// single `pnpm install` in CI's setup step, before anything has
					// built. A later build doesn't retroactively create it, so a
					// freshly scaffolded plugin joining this monorepo hits the same
					// "holocron: not found" turbo fan-out failure every existing
					// package's scripts were reverted from. Consuming repos outside
					// this monorepo don't have this problem (a real npm dependency
					// ships dist/ already built) — see packageScripts() in astromech.
					"delivery.build": "tsdown",
					"sourceQuality.staticAnalysis": "eslint .",
					"verification.typeSafety": "tsc --noEmit",
					"verification.unitTests": "vitest run",
					"test:watch": "vitest",
					validate: "tsx scripts/validate.mjs",
				},
				peerDependencies: { "@theholocron/cli": "workspace:*" },
				devDependencies: {
					"@theholocron/cli": "workspace:*",
					"@theholocron/tsconfig": "catalog:",
					"@tsconfig/node-lts": "catalog:",
					"@vitest/coverage-v8": "catalog:",
					eslint: "catalog:",
					globals: "catalog:",
					typescript: "catalog:",
					vitest: "catalog:",
					tsdown: "catalog:",
					tsx: "catalog:",
				},
				publishConfig: {
					access: "public",
					main: "./dist/index.mjs",
					types: "./dist/index.d.mts",
					exports: {
						".": {
							types: "./dist/index.d.mts",
							import: "./dist/index.mjs",
							default: "./dist/index.mjs",
						},
					},
				},
				files: ["dist", "README.md"],
			},
			null,
			"\t"
		) + "\n"
	);
}
