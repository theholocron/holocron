#!/usr/bin/env node
/**
 * Assembles `.vercel-deploy/` — exactly what `holocron deploy --files`
 * should upload for Sentinel, nothing more. `packages/sentinel/` itself
 * also holds source, tests, coverage output, and this package's own
 * dev tooling config — none of which belongs in the deploy payload.
 *
 * Output:
 *   .vercel-deploy/
 *     api/webhook.mjs   — the Vercel Function entry point (checked-in, copied verbatim)
 *     dist/index.mjs    — this package's built library (run delivery.build first)
 *     vercel.json       — checked-in, copied verbatim: `functions["api/webhook.mjs"]
 *                          .includeFiles: "node_modules/**"` forces Vercel to ship this
 *                          function's ENTIRE installed node_modules, bypassing
 *                          `@vercel/nft`'s static file tracer. Needed because
 *                          commitlint's own config-resolution chain
 *                          (`@theholocron/commitlint-config` → `@commitlint/
 *                          config-conventional` → `conventional-changelog-
 *                          conventionalcommits` → ...) is resolved by *string name*
 *                          at runtime (`extends: [...]`), never through a real
 *                          import/require nft could trace — found live chasing one
 *                          "Cannot find module" at a time through that exact chain
 *                          (holocron#776-#778) before landing on this instead. Since
 *                          this function's node_modules is already fully controlled
 *                          by the trimmed `package.json` below (nothing extra to
 *                          prune), there's no upside to nft's pruning here, only risk.
 *     package.json      — trimmed: name/version/type/engines + dependencies only,
 *                          each pinned to the exact version actually
 *                          resolved in node_modules right now (not the
 *                          "workspace:" / "catalog:" pnpm protocol
 *                          specifiers — Vercel's `npm install` doesn't understand
 *                          those; it needs real, installable versions).
 *                          No devDependencies, no scripts — nothing
 *                          Vercel's install step would waste time on.
 *
 * The `@theholocron/*` workspace packages (astromech, datapad, cli) are
 * inlined into `dist/` by `tsdown.config.ts` (holocron#922), so the code
 * Sentinel runs is the code it was built from, whatever version gets
 * pinned here. They stay in `dependencies` because a repo's own
 * `holocron.config.ts` imports `@theholocron/cli` / `astromech/config` at
 * runtime (only `defineConfig`, an identity function, so a version skew
 * there is harmless). Pinned versions still have to exist on npm: deploy
 * from a synced `alpha` checkout, not an unreleased local branch.
 *
 * Not its own package.json script — an internal step of
 * `delivery.deploy` (build → this → `holocron deploy`). Run that
 * instead of invoking this file directly.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { undeclaredExternals } from "./bundle-externals.mjs";
import { vercelEngines } from "./vercel-engines.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(packageDir, ".vercel-deploy");

function resolvedVersion(depName) {
	const pkgPath = join(packageDir, "node_modules", depName, "package.json");
	if (!existsSync(pkgPath)) {
		throw new Error(
			`cannot resolve installed version of "${depName}" — run \`pnpm install\` first (looked in ${pkgPath})`
		);
	}
	return JSON.parse(readFileSync(pkgPath, "utf8")).version;
}

/**
 * Refuses to stage a bundle that imports a package the trimmed deploy
 * `package.json` won't install (holocron#922) — see `bundle-externals.mjs`.
 */
function assertExternalsDeclared(distIndex, pkg) {
	const missing = undeclaredExternals(readFileSync(distIndex, "utf8"), pkg.dependencies ?? {});
	if (missing.length > 0) {
		throw new Error(
			[
				"refusing to stage: dist/index.mjs imports packages that aren't in this package's `dependencies`,",
				"so Vercel wouldn't install them —",
				...missing.map((name) => `  - ${name}`),
				"Add each to packages/sentinel/package.json (usually a new dependency of an inlined workspace package).",
			].join("\n")
		);
	}
}

function main() {
	const distIndex = join(packageDir, "dist", "index.mjs");
	if (!existsSync(distIndex)) {
		throw new Error(`${distIndex} not found — run \`pnpm run delivery.build\` first`);
	}

	const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
	// Before any output is written: an undeclared external means this payload
	// would crash on import once deployed.
	assertExternalsDeclared(distIndex, pkg);

	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(join(outDir, "api"), { recursive: true });
	mkdirSync(join(outDir, "dist"), { recursive: true });

	copyFileSync(join(packageDir, "api", "webhook.mjs"), join(outDir, "api", "webhook.mjs"));
	copyFileSync(distIndex, join(outDir, "dist", "index.mjs"));
	copyFileSync(join(packageDir, "vercel.json"), join(outDir, "vercel.json"));

	const dependencies = Object.fromEntries(
		Object.keys(pkg.dependencies ?? {}).map((name) => [name, resolvedVersion(name)])
	);
	const deployPkg = {
		name: pkg.name,
		version: pkg.version,
		type: "module",
		// Vercel picks the function's Node version from this field, falling
		// back to the project's dashboard default without it (holocron#909: that
		// default was too old for require(esm), and the WASM engines want >=22).
		engines: vercelEngines(pkg.engines),
		dependencies,
	};
	writeFileSync(join(outDir, "package.json"), JSON.stringify(deployPkg, null, 2) + "\n");

	console.log(`Staged deploy payload at ${outDir}`);
	console.log(
		`  dependencies: ${Object.entries(dependencies)
			.map(([n, v]) => `${n}@${v}`)
			.join(", ")}`
	);
}

main();
