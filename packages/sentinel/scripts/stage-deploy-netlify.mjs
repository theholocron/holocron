#!/usr/bin/env node
/**
 * Builds and deploys Sentinel's Netlify Function directly through
 * `@theholocron/netlify-client` — bypasses `holocron deploy` /
 * `Deployment.deployFunction()` entirely, per
 * `@theholocron/holocron-plugin-netlify`'s own doc comment: that
 * capability doesn't implement `deployFunction` at all, since
 * `DeployFunctionConfig.files` is text-only (`Record<string, string>`)
 * and can't carry a real `node_modules` (binary addons, wasm) — and
 * Netlify's raw function-deploy API runs no install step at all for a
 * digest upload, unlike Vercel's.
 *
 * Parked per `.notes/tech-sentinel-deploy-architecture-reconsideration.spec.md`
 * (holocron#945) — not wired into `package.json`'s `delivery.deploy`
 * script, which still points at Vercel. This file is the concrete
 * deliverable if that decision lands on "stay on a Function, on
 * Netlify" — exercised directly (`node scripts/stage-deploy-netlify.mjs`
 * after `pnpm run delivery.build`), not through any package script yet.
 *
 * Steps:
 *   1. Stage a trimmed/pinned `package.json` (same discipline as
 *      `stage-deploy.mjs`'s own `resolvedVersion()` — exact installed
 *      versions, not pnpm's `workspace:`/`catalog:` protocol
 *      specifiers) into a throwaway directory, then `npm install`
 *      there with explicit linux-x64/glibc platform flags — forced
 *      regardless of which OS/arch this script itself runs on, so the
 *      installed `node_modules` is always correct for Netlify's Lambda
 *      runtime (`.notes/tech-sentinel-deploy-target-netlify.spec.md`'s
 *      spike gotcha #3).
 *   2. Walk that `node_modules` into a flat `{ path: content }` map,
 *      alongside built `dist/index.mjs` and this package's own
 *      Lambda-adapter entry point (`netlify/functions/webhook.mjs`) —
 *      `buildZip()` from `@theholocron/netlify-client`.
 *   3. `createNetlifyClient().deploys.create(siteId, { functions: [...] })`
 *      — the digest-based flow, the only one that deploys real,
 *      invokable functions (clients#389); the single-whole-zip method
 *      only deploys static assets.
 *
 * Auth: `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID` env vars directly —
 * this script calls the client package itself, not through a plugin,
 * so it does its own (minimal) auth reading rather than going through
 * `holocron auth`'s resolver chain.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildZip, createNetlifyClient } from "@theholocron/netlify-client";

import { undeclaredExternals } from "./bundle-externals.mjs";
import { vercelEngines as pinnedEngines } from "./vercel-engines.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const FUNCTION_NAME = "webhook";

function resolvedVersion(depName) {
	const pkgPath = join(packageDir, "node_modules", depName, "package.json");
	if (!existsSync(pkgPath)) {
		throw new Error(
			`cannot resolve installed version of "${depName}" — run \`pnpm install\` first (looked in ${pkgPath})`
		);
	}
	return JSON.parse(readFileSync(pkgPath, "utf8")).version;
}

/** Same check as `stage-deploy.mjs`'s own — deploy-target-agnostic (holocron#922). */
function assertExternalsDeclared(distIndex, pkg) {
	const missing = undeclaredExternals(readFileSync(distIndex, "utf8"), pkg.dependencies ?? {});
	if (missing.length > 0) {
		throw new Error(
			[
				"refusing to stage: dist/index.mjs imports packages that aren't in this package's `dependencies`,",
				"so the function's own node_modules wouldn't include them —",
				...missing.map((name) => `  - ${name}`),
				"Add each to packages/sentinel/package.json (usually a new dependency of an inlined workspace package).",
			].join("\n")
		);
	}
}

/** Recursively walks `dir`, returning `{ "<relative/posix/path>": Buffer }` for every regular file under it. Symlinks (pnpm's `.bin` shims, any package's own internal symlinks) are skipped — a STORED zip entry can't represent one, and none are needed at runtime for an `import`-only consumer. */
function walkFiles(dir, baseDir = dir, out = {}) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isSymbolicLink()) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			walkFiles(full, baseDir, out);
		} else if (entry.isFile()) {
			out[relative(baseDir, full).split(sep).join("/")] = readFileSync(full);
		}
	}
	return out;
}

function requireEnv(name) {
	const value = process.env[name];
	if (!value) throw new Error(`stage-deploy-netlify.mjs: ${name} is required`);
	return value;
}

async function main() {
	const distIndex = join(packageDir, "dist", "index.mjs");
	if (!existsSync(distIndex)) {
		throw new Error(`${distIndex} not found — run \`pnpm run delivery.build\` first`);
	}

	const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
	assertExternalsDeclared(distIndex, pkg);

	const dependencies = Object.fromEntries(
		Object.keys(pkg.dependencies ?? {}).map((name) => [name, resolvedVersion(name)])
	);
	const stageDir = mkdtempSync(join(tmpdir(), "sentinel-netlify-stage-"));
	try {
		writeFileSync(
			join(stageDir, "package.json"),
			JSON.stringify(
				{
					name: `${pkg.name}-netlify-function`,
					version: pkg.version,
					type: "module",
					engines: pinnedEngines(pkg.engines),
					dependencies,
				},
				null,
				2
			) + "\n"
		);
		// Forced platform flags regardless of this script's own host — Netlify's
		// Lambda runtime is always linux-x64/glibc, and a node_modules installed
		// on e.g. macOS ARM64 ships the wrong native binaries for any dependency
		// that has them (confirmed live against esbuild's optionalDependencies
		// during this spec's own spike).
		execFileSync(
			"npm",
			["install", "--omit=dev", "--no-audit", "--no-fund", "--os=linux", "--cpu=x64", "--libc=glibc"],
			{ cwd: stageDir, stdio: "inherit" }
		);

		const files = {
			[`${FUNCTION_NAME}.mjs`]: readFileSync(join(packageDir, "netlify", "functions", "webhook.mjs")),
			"dist/index.mjs": readFileSync(distIndex),
			...walkFiles(join(stageDir, "node_modules"), stageDir),
		};
		const zip = buildZip(files);

		const netlify = createNetlifyClient({ token: requireEnv("NETLIFY_AUTH_TOKEN") });
		const siteId = requireEnv("NETLIFY_SITE_ID");
		const deploy = await netlify.deploys.create(siteId, {
			functions: [{ name: FUNCTION_NAME, zip, runtime: "js" }],
		});

		console.log(`Deployed ${FUNCTION_NAME} — deploy ${deploy.id}, state ${deploy.state}`);
		console.log(
			`  dependencies: ${Object.entries(dependencies)
				.map(([n, v]) => `${n}@${v}`)
				.join(", ")}`
		);
	} finally {
		rmSync(stageDir, { recursive: true, force: true });
	}
}

await main();
