/**
 * `holocron publish --initial` — bottles up the chicken-and-egg bootstrap
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
 *   $ pnpm exec tsx packages/cli/src/cli.ts publish --initial
 *
 * `npm login --auth-type=web` runs automatically the first time — no
 * separate manual step. `pnpm install` + `pnpm build` stay outside the
 * command (no pnpm-inside-pnpm).
 *
 * `--initial` is required today — this command only implements the
 * bootstrap publish. A non-initial `holocron publish` (for a manual publish
 * outside the semantic-release/OIDC steady state) isn't built yet; the flag
 * exists so the surface doesn't need another rename when it is.
 *
 * If `NPM_TOKEN` is detected in env, the command prints a final
 * "revoke this token at <url>" reminder — same pattern as `rando vc
 * setup` for the ephemeral GH admin PAT.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Logger } from "@theholocron/observability/core";

import { type CliEnv, makeEnv } from "../env.js";
import { getLogger } from "../logger.js";

export type PublishPrint = (line: string) => void;

export type PublishExecResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export interface RunPublishInput {
	/** Working directory (the monorepo or package root). Defaults to process.cwd(). */
	cwd?: string;
	/** Distribution tag for the publish. Defaults to `'alpha'`. */
	tag?: string;
	/** Skip the actual publish; print what would happen. */
	dryRun?: boolean;
	/**
	 * One-time password (TOTP) from your authenticator app. Required if
	 * your npm account has "Require 2FA for read and write" enabled.
	 * Reused across all sequential publishes — they fire within a few
	 * seconds, comfortably inside the TOTP window.
	 */
	otp?: string;
	print?: PublishPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/**
	 * Injectable command runner. Defaults to `spawnSync` with
	 * `stdio: ['inherit', 'pipe', 'pipe']` so interactive prompts
	 * (e.g., npm OTP) still work.
	 *
	 * Returns exit code + captured stdout/stderr.
	 */
	exec?: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>;
	/**
	 * Injectable `npm login --auth-type=web` runner, invoked when `npm
	 * whoami` shows no authenticated session. Fully `stdio: 'inherit'` (not
	 * `exec`'s captured-output shape) — the browser flow prints a URL and
	 * waits, and the operator needs to see that live. Defaults to a real
	 * `spawnSync`.
	 */
	login?: (cwd: string) => Promise<{ exitCode: number }>;
	/** Env vars; passed in for testability. Defaults to process.env. */
	env?: NodeJS.ProcessEnv;
	/**
	 * Override the list of package names shown in the Trusted Publisher
	 * next-steps output. Auto-discovered from packages/*\/package.json
	 * (or the root package.json for a single-package repo) when omitted.
	 */
	packages?: readonly string[];
	/**
	 * Override the repo name shown in the Trusted Publisher next-steps
	 * output. Auto-detected from `git remote get-url origin` when omitted.
	 */
	repoName?: string;
}

export type PublishStatus = "ok" | "fail" | "dry-run";

export interface PublishReport {
	status: PublishStatus;
	message?: string;
	/** Packages that the publish step targeted. */
	packageNames: readonly string[];
}

export interface RunSyncTrustInput {
	/** Working directory (the monorepo or package root). Defaults to process.cwd(). */
	cwd?: string;
	/** The workflow filename npm's Trusted Publisher config currently points at. */
	oldFile: string;
	/** The workflow filename to migrate every package's Trusted Publisher config to. */
	newFile: string;
	/** `owner/repo` for the GitHub Trusted Publisher config. Defaults to `theholocron/holocron`. */
	repo?: string;
	/** Skip the actual npm calls; print what would happen. */
	dryRun?: boolean;
	print?: PublishPrint;
	logger?: Logger;
	/** Injectable command runner — same shape as `RunPublishInput['exec']`. */
	exec?: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>;
	/** Override the list of package names. Auto-discovered when omitted. */
	packages?: readonly string[];
}

export interface SyncTrustPackageResult {
	name: string;
	status: "ok" | "skipped" | "needs-auth" | "fail";
	message?: string;
}

export interface SyncTrustReport {
	status: PublishStatus;
	message?: string;
	packages: readonly SyncTrustPackageResult[];
}

interface NpmTrustEntry {
	id?: string;
	file?: string;
}
interface NpmTrustError {
	error?: { code?: string; authUrl?: string };
}

/**
 * `holocron publish --sync-trust <old-file> <new-file>` — bulk-migrates npm
 * Trusted Publisher (OIDC) config to a new workflow filename across every
 * public package. See issue #689 / `scripts/npm-trust-migrate.sh` (the
 * shell-script prototype this supersedes) for the full "why": npm ties
 * Trusted Publisher to a workflow FILENAME per package, so renaming the
 * release workflow breaks OIDC publish (`ENEEDAUTH`) until every package's
 * config is updated to match.
 *
 * Requires npm@11.15.0+ (`npm trust`) — always shells out through
 * `npx -y npm@latest` regardless of the locally-installed npm version.
 *
 * npm's `trust` mutations — and reads, once a short-lived OTP grant lapses —
 * require a fresh interactive browser 2FA approval (an `EOTP` error with an
 * `authUrl`). No token bypasses this (npm's own docs: Granular Access Tokens
 * with the bypass-2FA option are explicitly unsupported for trust commands).
 * This command can't drive that browser step itself, so on the first `EOTP`
 * it stops immediately, prints the `authUrl`, and returns — the operator
 * approves it and re-runs; already-migrated packages are skipped on the next
 * pass, so it's safe to resume from wherever it stopped.
 */
export async function runSyncTrust(input: RunSyncTrustInput): Promise<SyncTrustReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const cwd = input.cwd ?? process.cwd();
	const repo = input.repo ?? "theholocron/holocron";
	const dryRun = input.dryRun ?? false;
	const exec = input.exec ?? defaultExec;
	const packageNames = input.packages ?? discoverPublicPackages(cwd);
	const npm = "npx";
	const npmArgs = ["-y", "npm@latest"];

	print(`Holocron publish --sync-trust${dryRun ? " (dry-run)" : ""}`);
	print(`  ${input.oldFile} -> ${input.newFile}  (repo: ${repo})`);
	print(`  ${packageNames.length} public packages`);
	print("");
	logger.info({ oldFile: input.oldFile, newFile: input.newFile, packages: packageNames.length }, "sync-trust: start");

	if (packageNames.length === 0) {
		const message = "nothing to sync (no packages/* and root package.json is private or unnamed)";
		print(`  ✗ ${message}`);
		return { status: "fail", message, packages: [] };
	}

	if (dryRun) {
		for (const name of packageNames) print(`  … would sync ${name}`);
		return { status: "dry-run", message: "dry-run — no npm calls made", packages: [] };
	}

	const results: SyncTrustPackageResult[] = [];

	for (const name of packageNames) {
		print(`=== ${name} ===`);
		const listResult = await exec(npm, [...npmArgs, "trust", "list", name, "--json"], { cwd });
		const parsed = parseJson(listResult.stdout);

		if (isEotp(parsed)) {
			const authUrl = (parsed as NpmTrustError).error?.authUrl ?? "";
			print(`  needs fresh 2FA — open and approve: ${authUrl}`);
			print("  then re-run; already-migrated packages are skipped.");
			results.push({ name, status: "needs-auth", message: authUrl });
			logger.warn({ package: name, authUrl }, "sync-trust: needs auth, stopping");
			return { status: "fail", message: "npm 2FA grant needed — see printed authUrl", packages: results };
		}

		const entry = parsed as NpmTrustEntry;
		if (entry.file === input.newFile) {
			print(`  already on ${input.newFile}, skipping`);
			results.push({ name, status: "skipped" });
			continue;
		}

		if (entry.id) {
			print(`  revoking existing trust (file=${entry.file ?? "?"}, id=${entry.id})`);
			const revoke = await exec(npm, [...npmArgs, "trust", "revoke", name, "--id", entry.id, "-y"], { cwd });
			if (revoke.exitCode !== 0 && isEotp(parseJson(revoke.stdout))) {
				const authUrl = (parseJson(revoke.stdout) as NpmTrustError).error?.authUrl ?? "";
				print(`  needs fresh 2FA — open and approve: ${authUrl}`);
				results.push({ name, status: "needs-auth", message: authUrl });
				return { status: "fail", message: "npm 2FA grant needed — see printed authUrl", packages: results };
			}
		} else {
			print("  no existing trust config found");
		}

		print(`  creating trust: ${input.newFile}`);
		const create = await exec(
			npm,
			[
				...npmArgs,
				"trust",
				"github",
				name,
				"--repo",
				repo,
				"--file",
				input.newFile,
				"--allow-publish",
				"--allow-stage-publish",
				"-y",
			],
			{ cwd }
		);
		if (create.exitCode === 0) {
			print("  ✓ ok");
			results.push({ name, status: "ok" });
		} else {
			const createParsed = parseJson(create.stdout);
			if (isEotp(createParsed)) {
				const authUrl = (createParsed as NpmTrustError).error?.authUrl ?? "";
				print(`  needs fresh 2FA — open and approve: ${authUrl}`);
				results.push({ name, status: "needs-auth", message: authUrl });
				return { status: "fail", message: "npm 2FA grant needed — see printed authUrl", packages: results };
			}
			const message = create.stderr.trim() || create.stdout.trim() || `exit ${create.exitCode}`;
			print(`  ✗ FAILED: ${message}`);
			results.push({ name, status: "fail", message });
		}
	}

	const failed = results.filter((r) => r.status === "fail");
	logger.info({ ok: results.filter((r) => r.status === "ok").length, failed: failed.length }, "sync-trust: done");
	return {
		status: failed.length > 0 ? "fail" : "ok",
		...(failed.length > 0 ? { message: `${failed.length} package(s) failed` } : {}),
		packages: results,
	};
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return undefined;
	}
}

function isEotp(parsed: unknown): boolean {
	return (
		typeof parsed === "object" &&
		parsed !== null &&
		"error" in parsed &&
		(parsed as NpmTrustError).error?.code === "EOTP"
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

	// Two repo layouts: a monorepo (`packages/*`, this repo's own shape) and a
	// single package at the root (most `node-template` scaffolds — no
	// `packages/` dir). `pnpm -r --filter=./packages/*` silently matches zero
	// workspaces in the latter and exits 0 — build the right invocation for
	// whichever layout is on disk. Shared between dry-run preview and the
	// real call so what we print is exactly what we'd run.
	const isMonorepo = hasPackagesDir(cwd);
	const publishArgs = [
		...(isMonorepo ? ["-r", "--filter=./packages/*"] : []),
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
		const message = "nothing to publish (no packages/* and root package.json is private or unnamed)";
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
			print(`    pnpm exec tsx packages/cli/src/cli.ts publish --initial --otp <6-digit-code>`);
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

export interface RunSteadyPublishInput {
	/** Working directory (the monorepo or package root). Defaults to process.cwd(). */
	cwd?: string;
	/** Distribution tag for the publish. Defaults to `'latest'` (steady-state releases are stable by default; `--initial`'s bootstrap default is `'alpha'`). */
	tag?: string;
	/** Skip the actual publish; print what would happen. */
	dryRun?: boolean;
	otp?: string;
	print?: PublishPrint;
	logger?: Logger;
	exec?: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>;
	env?: NodeJS.ProcessEnv;
	/** Override the list of package names/versions. Auto-discovered when omitted. */
	packages?: readonly PublicPackageEntry[];
	/** Add `--provenance`. Defaults to `true` — every steady-state publish runs in CI under OIDC, where provenance is free and expected. */
	provenance?: boolean;
	/**
	 * Check `npm view <pkg>@<version>` before publishing each package and
	 * skip it if that exact version already exists, instead of one bulk
	 * `pnpm -r publish`. For repos that ship many independently-versioned
	 * packages where a release doesn't bump every one of them (this repo's
	 * own lockstep-bump model doesn't need it — every package always gets a
	 * new version together). Defaults to `false`.
	 */
	skipAlreadyPublished?: boolean;
}

/**
 * `holocron publish` (no `--initial`) — the steady-state publish
 * `exec.publishCmd` in `release.config.ts` should call, replacing each
 * repo's hand-typed `pnpm -r --filter=./packages/* publish ...` shell (which
 * differs, today, only in monorepo-vs-single-package, provenance on/off, and
 * whether a repo needs to skip already-published packages) with one uniform
 * invocation. Part of the config-resolution workstream, #676 — see
 * `.notes/tech-config-resolution.spec.md`.
 *
 * Deliberately does not do the `--initial` bootstrap dance (npm
 * login-if-needed, Trusted Publisher next-steps printout) — a steady-state
 * publish runs in CI, authenticated via OIDC automatically, no interactive
 * step involved. Reuses `hasPackagesDir()`'s monorepo-vs-single-package
 * detection rather than duplicating it.
 */
export async function runSteadyPublish(input: RunSteadyPublishInput = {}): Promise<PublishReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const cwd = input.cwd ?? process.cwd();
	const tag = input.tag ?? "latest";
	const dryRun = input.dryRun ?? false;
	const otp = input.otp;
	const exec = input.exec ?? defaultExec;
	const provenance = input.provenance ?? true;
	const skipAlreadyPublished = input.skipAlreadyPublished ?? false;
	const entries = input.packages ?? discoverPublicPackageEntries(cwd);
	const packageNames = entries.map((e) => e.name);

	print(`Holocron publish${dryRun ? " (dry-run)" : ""}`);
	print(`  cwd: ${cwd}`);
	print(`  tag: ${tag}`);
	print(`  provenance: ${provenance}`);
	if (skipAlreadyPublished) print("  skip-already-published: true");
	logger.info({ tag, provenance, skipAlreadyPublished, dryRun: dryRun || undefined }, "publish: start");
	if (otp) print(`  otp: <${otp.length} chars>`);
	print("");

	if (entries.length === 0) {
		const message = "nothing to publish (no packages/* and root package.json is private or unnamed)";
		print(`  ✗ ${message}`);
		logger.warn({ reason: message }, "publish: done");
		return { status: "fail", message, packageNames };
	}

	const baseFlags = ["--access", "public", "--no-git-checks", "--tag", tag, ...(provenance ? ["--provenance"] : [])];
	const otpFlags = otp ? ["--otp", otp] : [];

	if (dryRun) {
		print("");
		if (skipAlreadyPublished) {
			for (const entry of entries) {
				print(`  … would check ${entry.name}@${entry.version}, publish if not already on npm`);
			}
		} else {
			const isMonorepo = hasPackagesDir(cwd);
			const args = [...(isMonorepo ? ["-r", "--filter=./packages/*"] : []), "publish", ...baseFlags, ...otpFlags];
			print(`  … (dry-run) skipping actual publish`);
			print(`    would run: pnpm ${args.join(" ")}`);
		}
		logger.info({ tag, status: "dry-run", packages: entries.length }, "publish: done");
		return { status: "dry-run", message: "dry-run — no publish executed", packageNames };
	}

	if (skipAlreadyPublished) {
		print("  → publishing packages not already on npm…");
		for (const entry of entries) {
			const view = await exec("npm", ["view", `${entry.name}@${entry.version}`, "version"], { cwd });
			if (view.exitCode === 0 && view.stdout.trim()) {
				print(`    skip ${entry.name}@${entry.version} (already published)`);
				continue;
			}
			const publish = await exec("pnpm", ["--filter", entry.dir, "publish", ...baseFlags, ...otpFlags], { cwd });
			if (publish.exitCode !== 0) {
				const message = `publish failed for ${entry.name}@${entry.version} (exit ${publish.exitCode}): ${publish.stderr.trim() || publish.stdout.trim() || "no output"}`;
				print(`  ✗ ${message}`);
				logger.warn({ tag, package: entry.name, reason: message }, "publish: done");
				return { status: "fail", message, packageNames };
			}
			print(`    ✓ ${entry.name}@${entry.version}`);
		}
		logger.info({ tag, status: "ok", packages: entries.length }, "publish: done");
		return { status: "ok", packageNames };
	}

	print("  → publishing all public @theholocron/* packages…");
	const isMonorepo = hasPackagesDir(cwd);
	const args = [...(isMonorepo ? ["-r", "--filter=./packages/*"] : []), "publish", ...baseFlags, ...otpFlags];
	const publish = await exec("pnpm", args, { cwd });
	if (publish.exitCode !== 0) {
		const message = `publish failed (exit ${publish.exitCode}): ${publish.stderr.trim() || publish.stdout.trim() || "no output"}`;
		print(`  ✗ ${message}`);
		if (publish.stdout.includes("EOTP") || publish.stderr.includes("EOTP")) {
			print("");
			print("  → hint: your npm account requires 2FA for writes. Re-run with `--otp <code>`:");
			print(`    pnpm exec holocron publish --otp <6-digit-code>`);
		}
		logger.warn({ tag, reason: message }, "publish: done");
		return { status: "fail", message, packageNames };
	}
	print("    ✓ publish complete");
	logger.info({ tag, status: "ok", packages: entries.length }, "publish: done");
	return { status: "ok", packageNames };
}

// ── helpers ──────────────────────────────────────────────────────────

function hasPackagesDir(cwd: string): boolean {
	return existsSync(join(cwd, "packages"));
}

/** Read a `package.json`'s `name`, when it's public (`!private && name`). */
function publicPackageName(pkgPath: string): string | undefined {
	if (!existsSync(pkgPath)) return undefined;
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string; private?: boolean };
		return !pkg.private && pkg.name ? pkg.name : undefined;
	} catch {
		return undefined;
	}
}

export interface PublicPackageEntry {
	name: string;
	version: string;
	/** `pnpm --filter` target: `.` for a single-package repo, `./packages/<dir>` for a monorepo workspace. */
	dir: string;
}

/** Read a `package.json`'s `name` + `version`, when it's public (`!private && name`). */
function publicPackageEntry(pkgPath: string, dir: string): PublicPackageEntry | undefined {
	if (!existsSync(pkgPath)) return undefined;
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
			name?: string;
			version?: string;
			private?: boolean;
		};
		return !pkg.private && pkg.name && pkg.version ? { name: pkg.name, version: pkg.version, dir } : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Same repo-layout detection as {@link discoverPublicPackages}, but carrying
 * version + a `pnpm --filter`-ready path — {@link runSteadyPublish}'s
 * `skipAlreadyPublished` mode needs both to check `npm view <pkg>@<version>`
 * and publish one workspace at a time.
 */
function discoverPublicPackageEntries(cwd: string): readonly PublicPackageEntry[] {
	if (!hasPackagesDir(cwd)) {
		const entry = publicPackageEntry(join(cwd, "package.json"), ".");
		return entry ? [entry] : [];
	}
	const packagesDir = join(cwd, "packages");
	return readdirSync(packagesDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.flatMap((e) => {
			const entry = publicPackageEntry(join(packagesDir, e.name, "package.json"), `./packages/${e.name}`);
			return entry ? [entry] : [];
		});
}

/**
 * Monorepo (`packages/` present): every public `packages/*` workspace.
 * Single package (no `packages/`): the root `package.json`, if it's public —
 * most `node-template` scaffolds are one package at the repo root.
 */
function discoverPublicPackages(cwd: string): readonly string[] {
	if (!hasPackagesDir(cwd)) {
		const name = publicPackageName(join(cwd, "package.json"));
		return name ? [name] : [];
	}
	const packagesDir = join(cwd, "packages");
	return readdirSync(packagesDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.flatMap((e) => {
			const name = publicPackageName(join(packagesDir, e.name, "package.json"));
			return name ? [name] : [];
		});
}

async function resolveRepoName(cwd: string, exec: NonNullable<RunPublishInput["exec"]>): Promise<string> {
	const result = await exec("git", ["remote", "get-url", "origin"], { cwd });
	if (result.exitCode !== 0) return "unknown";
	// Matches both HTTPS (https://github.com/org/repo.git) and
	// SSH (git@github.com:org/repo.git) remote URL formats.
	const match = /[/:]([^/:]+?)(?:\.git)?$/.exec(result.stdout.trim());
	return match?.[1] ?? "unknown";
}

function printNextSteps(print: PublishPrint, env: CliEnv, packageNames: readonly string[], repoName: string): void {
	print("");
	print("  → next: configure Trusted Publisher for each package on npm:");
	for (const name of packageNames) {
		print(`    https://www.npmjs.com/package/${name}/access`);
	}
	print(`    Publisher: GitHub Actions   Org: theholocron   Repo: ${repoName}   Workflow: delivery.publish.yml`);

	if (env.get("NPM_TOKEN")) {
		print("");
		print("  → cleanup: $NPM_TOKEN was used. Revoke it now (no API for self-revoke; UI-only):");
		print("    https://www.npmjs.com/settings/~/tokens");
	}
}

const defaultExec: NonNullable<RunPublishInput["exec"]> = async (cmd, args, opts) => {
	const result = spawnSync(cmd, args, {
		cwd: opts.cwd,
		encoding: "utf8",
		stdio: ["inherit", "pipe", "pipe"],
	});
	return {
		exitCode: result.status ?? -1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
};

/**
 * Fully interactive — `npm login --auth-type=web` prints a URL and waits for
 * the browser flow to complete; the operator needs to see that live, so all
 * three stdio streams are inherited (unlike `defaultExec`, which pipes
 * stdout/stderr for capture).
 */
const defaultLogin: NonNullable<RunPublishInput["login"]> = async (cwd) => {
	const result = spawnSync("npm", ["login", "--auth-type=web"], { cwd, stdio: "inherit" });
	return { exitCode: result.status ?? -1 };
};
