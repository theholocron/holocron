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
 * Caveat: the pinned `@theholocron/*` versions are whatever's in
 * node_modules right now — deploy from a synced `alpha` checkout
 * (they publish on every merge), not an unreleased local branch.
 * Enforced, not just documented (holocron#919): staging refuses when a
 * workspace dependency's source differs from its `v<version>` release
 * tag, since Vercel would install a published version that lacks it —
 * found live as an import crash on every webhook.
 *
 * Not its own package.json script — an internal step of
 * `delivery.deploy` (build → this → `holocron deploy`). Run that
 * instead of invoking this file directly.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { vercelEngines } from "./vercel-engines.mjs";
import { staleWorkspaceDeps } from "./workspace-freshness.mjs";

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
 * Refuses to stage when a `workspace:` dependency's local source has moved
 * past its published release (holocron#919) — see `workspace-freshness.mjs`.
 */
function assertWorkspaceDepsPublished(pkg) {
	const git = (args) => {
		const result = spawnSync("git", args, { cwd: packageDir, encoding: "utf8" });
		return { status: result.status, stdout: result.stdout ?? "" };
	};
	const repoRoot = git(["rev-parse", "--show-toplevel"]).stdout.trim();
	const deps = Object.entries(pkg.dependencies ?? {})
		.filter(([, spec]) => String(spec).startsWith("workspace:"))
		.map(([name]) => ({
			name,
			version: resolvedVersion(name),
			dir: relative(repoRoot, realpathSync(join(packageDir, "node_modules", name))),
		}));
	const problems = staleWorkspaceDeps({ deps, git: (args) => git(["-C", repoRoot, ...args]) });
	if (problems.length > 0) {
		throw new Error(
			[
				"refusing to stage: Vercel would install published versions that lack this checkout's source —",
				...problems.map((p) => `  - ${p}`),
				"Deploy from a synced `alpha` checkout whose HEAD includes the latest `chore(release)` commit.",
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
	// Before any output is written: a stale workspace dependency means this
	// payload would crash on import once deployed.
	assertWorkspaceDepsPublished(pkg);

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
