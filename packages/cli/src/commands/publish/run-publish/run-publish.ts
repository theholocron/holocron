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
 * Self-narrowing: a package that already exists on npm (any version) isn't
 * the chicken-and-egg case anymore — Trusted Publishing can already be
 * configured for it, and every later version goes through the steady-state
 * publish instead. So every publicly publishable package on disk is checked
 * against the registry first, and only the ones that don't exist yet are
 * actually targeted. Re-running `--initial` after adding one new package to
 * an already-bootstrapped monorepo publishes just that one. Nothing left to
 * bootstrap is reported as a success, not a failure.
 *
 * If `NPM_TOKEN` is detected in env, the command prints a final
 * "revoke this token at <url>" reminder — same pattern as `rando vc
 * setup` for the ephemeral GH admin PAT.
 */

import { makeEnv } from "../../../env/index.js";
import { getLogger } from "../../../observability/logger/index.js";
import { pad, statusRow, style } from "../../../ui/index.js";
import { defaultExec } from "../default-exec.js";
import { defaultLogin } from "../default-login.js";
import { discoverPublicPackageEntries } from "../discover-public-package-entries.js";
import { filterNewPackages } from "../filter-new-packages.js";
import { printNextSteps } from "../print-next-steps.js";
import type { PublicPackageEntry } from "../public-package-entry.type.js";
import type { PublishPrint, PublishReport } from "../publish.type.js";
import { redactOtp } from "../redact-otp.js";
import { resolveRepoIdentity } from "../resolve-repo-identity.js";
import type { RepoIdentity } from "../resolve-repo-identity.type.js";
import { workspaceFilterArgs } from "../workspace-filter-args.js";
import type { RunPublishInput } from "./run-publish.type.js";

/**
 * The same `N <verb>, N failed, N skipped` shape `clone` ends on, styled the
 * same way (dim for a dry-run preview, success/fail for the real thing) —
 * `--initial` publishes in one atomic `pnpm publish` call rather than
 * `clone`'s per-repo loop, so `failedCount` is always either 0 or every
 * targeted package at once, never a partial count.
 */
function printSummary(
	print: PublishPrint,
	dryRun: boolean,
	publishedCount: number,
	failedCount: number,
	skippedCount: number
): void {
	const summary = `${publishedCount} published, ${failedCount} failed, ${skippedCount} skipped`;
	print("");
	print(
		dryRun
			? style.dim(`  dry-run: ${summary}`)
			: failedCount > 0
				? style.fail(`  ${summary}`)
				: style.success(`  ${summary}`)
	);
}

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

	logger.info({ tag, dryRun: dryRun || undefined }, "publish --initial: start");

	// ── 1. Verify npm auth — log in automatically if not ────────────────
	print("");
	print(style.dim("  → verifying npm auth (`npm whoami`)…"));
	let whoami = await exec("npm", ["whoami"], { cwd });
	if (whoami.exitCode !== 0) {
		print("    not authenticated — running `npm login --auth-type=web`…");
		logger.info({}, "publish --initial: npm login");
		const loginResult = await login(cwd);
		if (loginResult.exitCode !== 0) {
			const message = "npm login failed. Run `npm login --auth-type=web` (or `npm login`) manually, then re-run.";
			print(`  ✗ ${message}`);
			const packageNames = (input.packages ?? discoverPublicPackageEntries(cwd)).map((e) => e.name);
			logger.warn({ reason: "npm login failed" }, "publish --initial: done");
			return { status: "fail", message, packageNames };
		}
		whoami = await exec("npm", ["whoami"], { cwd });
		if (whoami.exitCode !== 0) {
			const message = "npm login completed but `npm whoami` still fails — check your npm account.";
			print(`  ✗ ${message}`);
			const packageNames = (input.packages ?? discoverPublicPackageEntries(cwd)).map((e) => e.name);
			logger.warn({ reason: "npm whoami still fails after login" }, "publish --initial: done");
			return { status: "fail", message, packageNames };
		}
	}
	const whoamiName = whoami.stdout.trim() || "<unknown>";
	print(style.dim(`    ✓ authed as ${whoamiName}`));

	print("");
	if (otp) print(style.dim(`  otp: <${otp.length} chars>`));

	// ── 2. Resolve dynamic values needed for next-steps ─────────────────
	// `--initial` only exists for the chicken-and-egg case: a package that
	// doesn't exist on npm yet, so Trusted Publishing can't be configured
	// for it. A package that already exists on npm (any version) isn't
	// that case anymore, regardless of what's publicly publishable on disk
	// — filter down to genuinely new ones before doing anything else, so
	// re-running --initial after adding one new package to an
	// already-bootstrapped monorepo only touches that one package.
	const discoveredEntries = input.packages ?? discoverPublicPackageEntries(cwd);
	// Computed once across every discovered entry (skipped and new alike) so
	// the skip rows filterNewPackages prints and the would-publish/published
	// rows below read as one aligned table, not two differently-padded ones.
	const nameWidth = Math.max(0, ...discoveredEntries.map((e) => e.name.length));
	const dirWidth = Math.max(0, ...discoveredEntries.map((e) => e.dir.length));
	const newEntries: PublicPackageEntry[] = input.packages
		? [...discoveredEntries]
		: await filterNewPackages(discoveredEntries, cwd, exec, print, nameWidth, dirWidth);
	const packageNames = newEntries.map((e) => e.name);
	const skippedCount = input.packages ? 0 : discoveredEntries.length - newEntries.length;
	// Both overridden -> skip the git remote read entirely; either missing
	// -> one combined read fills in whichever wasn't given.
	const resolvedIdentity: RepoIdentity =
		input.repoName !== undefined && input.orgName !== undefined
			? { owner: input.orgName, repo: input.repoName }
			: await resolveRepoIdentity(cwd, exec);
	const identity: RepoIdentity = {
		owner: input.orgName ?? resolvedIdentity.owner,
		repo: input.repoName ?? resolvedIdentity.repo,
	};

	if (packageNames.length === 0) {
		// Everything publicly publishable already exists on npm — not a
		// misconfiguration, just nothing left to bootstrap. Idempotent
		// success, same as re-running any already-applied setup step.
		if (input.packages === undefined && discoveredEntries.length > 0) {
			const message = "nothing to publish — every public package already exists on npm; nothing new to bootstrap";
			printSummary(print, dryRun, 0, 0, skippedCount);
			logger.info({ reason: message }, "publish --initial: done");
			return { status: "ok", message, packageNames };
		}
		// A `pnpm --filter=./packages/*` (or a bare `pnpm publish`) that
		// matches nothing still exits 0 — catch this no-op before it's
		// mistaken for success. Applies to dry-run too: the point is to
		// diagnose the misconfiguration, not just the real publish.
		const message = "nothing to publish (no packages/*, plugins/*, or root package.json is private or unnamed)";
		print(`  ✗ ${message}`);
		logger.warn({ reason: message }, "publish --initial: done");
		return { status: "fail", message, packageNames };
	}

	// Two repo layouts: a monorepo (its `pnpm-workspace.yaml` declares public
	// packages) and a single package at the root (most `node-template`
	// scaffolds — none declared). Target the exact packages
	// found to be new by name, not a directory glob — a glob would also
	// match every already-bootstrapped package sitting right next to them
	// and either re-publish them unnecessarily or fail outright on a
	// version already on npm. Shared between dry-run preview and the real
	// call so what we print is exactly what we'd run.
	const isMonorepo = workspaceFilterArgs(cwd).length > 0;
	const publishArgs = [
		...(isMonorepo ? ["-r", ...packageNames.map((name) => `--filter=${name}`)] : []),
		"publish",
		"--access",
		"public",
		"--no-git-checks",
		"--tag",
		tag,
		...(otp ? ["--otp", otp] : []),
	];

	// ── 3. Publish ──────────────────────────────────────────────────────
	if (dryRun) {
		print("");
		for (const entry of newEntries) {
			print(
				style.dim(
					`  ${pad(entry.name, nameWidth)}  ${pad(entry.dir, dirWidth)}  would publish (v${entry.version})`
				)
			);
		}
		print(style.dim(`  would run: pnpm ${redactOtp(publishArgs, otp).join(" ")}`));
		printSummary(print, dryRun, packageNames.length, 0, skippedCount);
		printNextSteps(print, env, packageNames, identity);
		logger.info({ tag, status: "dry-run", packages: packageNames.length }, "publish --initial: done");
		return { status: "dry-run", message: "dry-run — no publish executed", packageNames };
	}

	print("");
	print(`  → publishing ${packageNames.length} new package${packageNames.length === 1 ? "" : "s"}…`);
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
		// Atomic bulk publish: every targeted entry failed together, never partially.
		for (const entry of newEntries) {
			print(statusRow("fail", [pad(entry.name, nameWidth), pad(entry.dir, dirWidth), "publish failed"]));
		}
		printSummary(print, dryRun, 0, packageNames.length, skippedCount);
		logger.warn({ tag, reason: message }, "publish --initial: done");
		return { status: "fail", message, packageNames };
	}
	for (const entry of newEntries) {
		print(statusRow("ok", [pad(entry.name, nameWidth), pad(entry.dir, dirWidth), `published (v${entry.version})`]));
	}
	printSummary(print, dryRun, packageNames.length, 0, skippedCount);

	// ── 4. Next-step reminders ──────────────────────────────────────────
	printNextSteps(print, env, packageNames, identity);
	logger.info({ tag, status: "ok", packages: packageNames.length }, "publish --initial: done");
	return { status: "ok", packageNames };
}
