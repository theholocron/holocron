/**
 * `holocron deploy stage` — assembles `.vercel-deploy/`, exactly what
 * `holocron deploy --files` should upload for a Vercel Function package such as
 * Sentinel, nothing more. The package itself also holds source, tests, coverage
 * output and its own dev tooling config, none of which belongs in the payload.
 *
 * Output:
 *   .vercel-deploy/
 *     api/webhook.mjs   — the Vercel Function entry point (checked in, copied verbatim)
 *     dist/index.mjs    — the package's built library (run `delivery.build` first)
 *     vercel.json       — checked in, copied verbatim: `functions["api/webhook.mjs"]
 *                         .includeFiles: "node_modules/**"` forces Vercel to ship the
 *                         function's ENTIRE installed node_modules, bypassing
 *                         `@vercel/nft`'s static file tracer. Needed because
 *                         commitlint's own config-resolution chain
 *                         (`@theholocron/commitlint-config` → `@commitlint/
 *                         config-conventional` → `conventional-changelog-
 *                         conventionalcommits` → ...) is resolved by *string name*
 *                         at runtime (`extends: [...]`), never through a real
 *                         import/require nft could trace — found live chasing one
 *                         "Cannot find module" at a time through that exact chain
 *                         (holocron#776-#778) before landing on this instead. The
 *                         function's node_modules is already fully controlled by the
 *                         trimmed `package.json` below (nothing extra to prune), so
 *                         there is no upside to nft's pruning here, only risk.
 *     .npmrc            — `legacy-peer-deps=true`: the plugins peer on one exact CLI version
 *                         and on `^` ranges that a prerelease never satisfies, so a strict
 *                         install fails ERESOLVE. That setting also stops npm installing peers,
 *                         so `package.json` lists the required peers of each dependency too, at
 *                         the version installed beside it. An `installCommand` in vercel.json or in the
 *                         request did not reach the install Vercel runs for the function (the
 *                         deployment still ran a plain `npm install`); an `.npmrc` in the
 *                         payload applies to whichever `npm install` runs there.
 *     package.json      — trimmed: name/version/type/engines + dependencies only,
 *                         each pinned to the exact version actually resolved in
 *                         node_modules right now (not the "workspace:" / "catalog:"
 *                         pnpm protocol specifiers — Vercel's `npm install` doesn't
 *                         understand those; it needs real, installable versions).
 *                         No devDependencies, no scripts.
 *
 * The `@theholocron/*` workspace packages (astromech, datapad, cli) are
 * inlined into `dist/` by the package's bundler config (holocron#922), so the
 * code it runs is the code it was built from, whatever version gets pinned
 * here. They stay in `dependencies` because a repo's own `holocron.config.ts`
 * imports `@theholocron/cli` / `astromech/config` at runtime (only
 * `defineConfig`, an identity function, so a version skew there is harmless).
 * Pinned versions still have to exist on npm. A workspace package's `package.json` is not updated when it is
 * released (the plugins sit at 5.0.0-alpha.132 on disk and 5.0.0-alpha.393 on npm, and each peers on exactly one CLI
 * version), so an `@theholocron/*` dependency installed at an `alpha` prerelease is pinned to npm's `alpha` tag
 * instead (`pinAlphaReleases()`); the lookup fails when npm cannot be reached, rather than staging the stale version.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stringifyJson } from "@theholocron/json-utils";
import { errorMessage } from "@theholocron/misc-utils";

import { alphaRelease } from "./alpha-release/index.js";
import type { StageDeployInput, StageDeployReport } from "./deploy-stage.type.js";
import { installedPeers } from "./installed-peers.js";
import { pinAlphaReleases } from "./pin-alpha-releases/index.js";
import { undeclaredExternals } from "./undeclared-externals.js";
import { vercelEngines } from "./vercel-engines.js";

function installedVersion(packageDir: string, name: string): string {
	const pkgPath = join(packageDir, "node_modules", name, "package.json");
	if (!existsSync(pkgPath)) {
		throw new Error(
			`cannot resolve installed version of "${name}" — run \`pnpm install\` first (looked in ${pkgPath})`
		);
	}
	return JSON.parse(readFileSync(pkgPath, "utf8")).version;
}

/**
 * Stages the deploy payload for `packageDir`. Refuses (before writing anything)
 * when the built bundle imports a package the trimmed `package.json` won't
 * install, since that payload would crash on import once deployed.
 *
 * @returns `ok` with the payload's directory and pinned dependencies, or `fail` with why.
 */
export function stageDeploy(input: StageDeployInput): StageDeployReport {
	const { packageDir } = input;
	const outDir = input.outDir ?? join(packageDir, ".vercel-deploy");
	const print = input.print ?? (() => {});
	const resolveVersion = input.resolveVersion ?? installedVersion;
	const resolvePeers = input.resolvePeers ?? installedPeers;
	try {
		const distIndex = join(packageDir, "dist", "index.mjs");
		if (!existsSync(distIndex)) {
			throw new Error(`${distIndex} not found — run \`pnpm run delivery.build\` first`);
		}

		const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
		const missing = undeclaredExternals(readFileSync(distIndex, "utf8"), pkg.dependencies ?? {});
		if (missing.length > 0) {
			throw new Error(
				[
					"refusing to stage: dist/index.mjs imports packages that aren't in this package's `dependencies`,",
					"so Vercel wouldn't install them —",
					...missing.map((name) => `  - ${name}`),
					"Add each to the package's package.json (usually a new dependency of an inlined workspace package).",
				].join("\n")
			);
		}

		const direct = Object.fromEntries(
			Object.keys(pkg.dependencies ?? {}).map((name) => [name, resolveVersion(packageDir, name)])
		);
		// `.npmrc` turns off npm's own peer installation, so a peer a dependency needs at runtime is pinned here.
		// A package's own dependency wins over a peer of the same name.
		const peers = Object.fromEntries(
			Object.keys(direct)
				.flatMap((name) => Object.entries(resolvePeers(packageDir, name)))
				.filter(([name]) => !(name in direct))
		);
		const installed = Object.fromEntries(
			Object.entries({ ...direct, ...peers }).sort(([a], [b]) => a.localeCompare(b))
		);
		// A workspace package keeps the version it was last committed at, which a release does not update, so what is
		// installed can be far behind what npm serves; pin the `alpha` tag instead.
		const { dependencies, changes, mismatches } = pinAlphaReleases(installed, input.alphaRelease ?? alphaRelease);
		for (const change of changes) print(`  pinned to npm's alpha tag: ${change}`);
		for (const mismatch of mismatches) print(`  warning: ${mismatch}`);

		rmSync(outDir, { recursive: true, force: true });
		mkdirSync(join(outDir, "api"), { recursive: true });
		mkdirSync(join(outDir, "dist"), { recursive: true });
		copyFileSync(join(packageDir, "api", "webhook.mjs"), join(outDir, "api", "webhook.mjs"));
		copyFileSync(distIndex, join(outDir, "dist", "index.mjs"));
		copyFileSync(join(packageDir, "vercel.json"), join(outDir, "vercel.json"));

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
		writeFileSync(join(outDir, "package.json"), stringifyJson(deployPkg));
		writeFileSync(join(outDir, ".npmrc"), "legacy-peer-deps=true\n");

		print(`Staged deploy payload at ${outDir}`);
		print(
			`  dependencies: ${Object.entries(dependencies)
				.map(([n, v]) => `${n}@${v}`)
				.join(", ")}`
		);
		return { status: "ok", outDir, dependencies };
	} catch (error) {
		return { status: "fail", message: errorMessage(error) };
	}
}
