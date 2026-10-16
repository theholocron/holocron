/**
 * `holocron package publish --initial` — bottles up the chicken-and-egg bootstrap
 * that every new npm-published holocron monorepo hits.
 *
 * npm requires a package to exist before Trusted Publishing can be
 * configured on it. So the first publish has to happen outside the OIDC
 * flow — a browser-auth session (`npm login --auth-type=web`) or an
 * ephemeral automation token. This command drives the login step itself
 * (when `npm whoami` shows you're not authenticated), runs the publish
 * step, and tells you exactly what to do next.
 *
 * Workflow:
 *
 *   $ pnpm install --frozen-lockfile
 *   $ pnpm build
 *   $ pnpm exec tsx packages/cli/src/cli.ts package publish --initial
 *
 * `npm login --auth-type=web` runs automatically the first time — no
 * separate manual step. `pnpm install` + `pnpm build` stay outside the
 * command (no pnpm-inside-pnpm).
 *
 * `--initial` is required today — this command only implements the
 * bootstrap publish. A non-initial `holocron package publish` (for a manual publish
 * outside the semantic-release/OIDC steady state) isn't built yet; the flag
 * exists so the surface doesn't need another rename when it is.
 *
 * If `NPM_TOKEN` is detected in env, the command prints a final
 * "revoke this token at <url>" reminder — same pattern as `rando vc
 * setup` for the ephemeral GH admin PAT.
 */

import { makeEnv } from "../../env.js";
import { getLogger } from "../../observability/logger.js";
import { defaultExec } from "./default-exec.js";
import { defaultLogin } from "./default-login.js";
import { discoverPublicPackages } from "./discover-public-packages.js";
import { printNextSteps } from "./print-next-steps.js";
import type { PublishReport, RunPublishInput } from "./publish.type.js";
import { resolveRepoName } from "./resolve-repo-name.js";
import { workspaceFilterArgs } from "./workspace-filter-args.js";

export async function runPublish(input: RunPublishInput = {}): Promise<PublishReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const cwd = input.cwd ?? process.cwd();
	const tag = input.tag ?? "alpha";
	const dryRun = input.dryRun ?? false;
	const otp = input.otp;
	const env = makeEnv(input.env);
	const exec = input.exec ?? defaultExec;
	const login = input.login ?? defaultLogin;

	// Two repo layouts: a monorepo (`packages/*` and/or `plugins/*`, this
	// repo's own shape) and a single package at the root (most
	// `node-template` scaffolds — neither dir). `pnpm -r --filter=./packages/*`
	// silently matches zero workspaces in the latter and exits 0 — build the
	// right invocation for whichever layout is on disk. Shared between
	// dry-run preview and the real call so what we print is exactly what
	// we'd run.
	const publishArgs = [
		...workspaceFilterArgs(cwd),
		"publish",
		"--access",
		"public",
		"--no-git-checks",
		"--tag",
		tag,
		...(otp ? ["--otp", otp] : []),
	];

	print(`Holocron publish --initial${dryRun ? " (dry-run)" : ""}`);
	print(`  cwd: ${cwd}`);
	print(`  tag: ${tag}`);
	logger.info({ tag, dryRun: dryRun || undefined }, "publish --initial: start");
	if (otp) print(`  otp: <${otp.length} chars>`);
	print("");

	// ── 1. Verify npm auth — log in automatically if not ────────────────
	print("  → verifying npm auth (`npm whoami`)…");
	let whoami = await exec("npm", ["whoami"], { cwd });
	if (whoami.exitCode !== 0) {
		print("    not authenticated — running `npm login --auth-type=web`…");
		logger.info({}, "publish --initial: npm login");
		const loginResult = await login(cwd);
		if (loginResult.exitCode !== 0) {
			const message = "npm login failed. Run `npm login --auth-type=web` (or `npm login`) manually, then re-run.";
			print(`  ✗ ${message}`);
			const packageNames = input.packages ?? discoverPublicPackages(cwd);
			logger.warn({ reason: "npm login failed" }, "publish --initial: done");
			return { status: "fail", message, packageNames };
		}
		whoami = await exec("npm", ["whoami"], { cwd });
		if (whoami.exitCode !== 0) {
			const message = "npm login completed but `npm whoami` still fails — check your npm account.";
			print(`  ✗ ${message}`);
			const packageNames = input.packages ?? discoverPublicPackages(cwd);
			logger.warn({ reason: "npm whoami still fails after login" }, "publish --initial: done");
			return { status: "fail", message, packageNames };
		}
	}
	const whoamiName = whoami.stdout.trim() || "<unknown>";
	print(`    ✓ authed as ${whoamiName}`);

	// ── 2. Resolve dynamic values needed for next-steps ─────────────────
	const packageNames = input.packages ?? discoverPublicPackages(cwd);
	const repoName = input.repoName ?? (await resolveRepoName(cwd, exec));

	// A `pnpm --filter=./packages/*` (or a bare `pnpm publish`) that matches
	// nothing still exits 0 — catch the no-op before it's mistaken for
	// success. Applies to dry-run too: the point is to diagnose the
	// misconfiguration, not just the real publish.
	if (packageNames.length === 0) {
		const message = "nothing to publish (no packages/*, plugins/*, or root package.json is private or unnamed)";
		print(`  ✗ ${message}`);
		logger.warn({ reason: message }, "publish --initial: done");
		return { status: "fail", message, packageNames };
	}

	// ── 3. Publish ──────────────────────────────────────────────────────
	if (dryRun) {
		print("");
		print("  … (dry-run) skipping actual publish");
		print(`    would run: pnpm ${publishArgs.join(" ")}`);
		printNextSteps(print, env, packageNames, repoName);
		logger.info({ tag, status: "dry-run", packages: packageNames.length }, "publish --initial: done");
		return { status: "dry-run", message: "dry-run — no publish executed", packageNames };
	}

	print("");
	print("  → publishing all public @theholocron/* packages…");
	const publish = await exec("pnpm", publishArgs, { cwd });
	if (publish.exitCode !== 0) {
		const message = `publish failed (exit ${publish.exitCode}): ${publish.stderr.trim() || publish.stdout.trim() || "no output"}`;
		print(`  ✗ ${message}`);
		// Detect EOTP and surface the --otp hint right at the failure.
		if (publish.stdout.includes("EOTP") || publish.stderr.includes("EOTP")) {
			print("");
			print("  → hint: your npm account requires 2FA for writes. Re-run with `--otp <code>`:");
			print(`    pnpm exec tsx packages/cli/src/cli.ts package publish --initial --otp <6-digit-code>`);
		}
		logger.warn({ tag, reason: message }, "publish --initial: done");
		return { status: "fail", message, packageNames };
	}
	print("    ✓ publish complete");

	// ── 4. Next-step reminders ──────────────────────────────────────────
	printNextSteps(print, env, packageNames, repoName);
	logger.info({ tag, status: "ok", packages: packageNames.length }, "publish --initial: done");
	return { status: "ok", packageNames };
}
