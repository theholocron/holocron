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
	print(`    Publisher: GitHub Actions   Org: theholocron   Repo: ${repoName}   Workflow: release.yml`);

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
