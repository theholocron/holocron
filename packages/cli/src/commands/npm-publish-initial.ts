/**
 * `holocron npm publish-initial` — bottles up the chicken-and-egg
 * bootstrap that every new npm-published holocron monorepo hits.
 *
 * npm requires a package to exist before Trusted Publishing can be
 * configured on it. So the first publish has to happen outside the
 * OIDC flow — using either a browser-auth session (`npm login
 * --auth-type=web`) or an ephemeral automation token. This command
 * runs the publish step + tells you exactly what to do next.
 *
 * Workflow:
 *
 *   $ npm login --auth-type=web          # one-time, browser-based
 *   $ pnpm install --frozen-lockfile
 *   $ pnpm build
 *   $ pnpm exec tsx packages/cli/src/cli.ts npm publish-initial
 *
 * The command itself only handles the publish step + the post-publish
 * Trusted Publisher setup reminder. `pnpm install` + `pnpm build`
 * stay outside the command (no pnpm-inside-pnpm).
 *
 * If `NPM_TOKEN` is detected in env, the command prints a final
 * "revoke this token at <url>" reminder — same pattern as `rando vc
 * setup` for the ephemeral GH admin PAT.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export type PublishInitialPrint = (line: string) => void;

export type PublishExecResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export interface RunNpmPublishInitialInput {
	/** Working directory (the monorepo root). Defaults to process.cwd(). */
	cwd?: string;
	/** Distribution tag for the publish. Defaults to `'alpha'`. */
	tag?: string;
	/** Skip the actual publish; print what would happen. */
	dryRun?: boolean;
	/**
	 * One-time password (TOTP) from your authenticator app. Required if
	 * your npm account has "Require 2FA for read and write" enabled.
	 * Reused across all 7 sequential publishes — they fire within a few
	 * seconds, comfortably inside the TOTP window.
	 */
	otp?: string;
	print?: PublishInitialPrint;
	/**
	 * Injectable command runner. Defaults to `spawnSync` with
	 * `stdio: ['inherit', 'pipe', 'pipe']` so interactive prompts
	 * (e.g., npm OTP) still work.
	 *
	 * Returns exit code + captured stdout/stderr.
	 */
	exec?: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>;
	/** Env vars; passed in for testability. Defaults to process.env. */
	env?: NodeJS.ProcessEnv;
	/**
	 * Override the list of package names shown in the Trusted Publisher
	 * next-steps output. Auto-discovered from packages/*\/package.json
	 * when omitted.
	 */
	packages?: readonly string[];
	/**
	 * Override the repo name shown in the Trusted Publisher next-steps
	 * output. Auto-detected from `git remote get-url origin` when omitted.
	 */
	repoName?: string;
}

export type PublishInitialStatus = "ok" | "fail" | "dry-run";

export interface NpmPublishInitialReport {
	status: PublishInitialStatus;
	message?: string;
	/** Packages that the publish step targeted. */
	packageNames: readonly string[];
}

export async function runNpmPublishInitial(input: RunNpmPublishInitialInput = {}): Promise<NpmPublishInitialReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const cwd = input.cwd ?? process.cwd();
	const tag = input.tag ?? "alpha";
	const dryRun = input.dryRun ?? false;
	const otp = input.otp;
	const env = input.env ?? process.env;
	const exec = input.exec ?? defaultExec;

	// Build the publish args once — shared between dry-run preview and
	// the real call so what we print is exactly what we'd run.
	const publishArgs = [
		"-r",
		"--filter=./packages/*",
		"publish",
		"--access",
		"public",
		"--no-git-checks",
		"--tag",
		tag,
		...(otp ? ["--otp", otp] : []),
	];

	print(`Holocron npm publish-initial${dryRun ? " (dry-run)" : ""}`);
	print(`  cwd: ${cwd}`);
	print(`  tag: ${tag}`);
	if (otp) print(`  otp: <${otp.length} chars>`);
	print("");

	// ── 1. Verify npm auth ──────────────────────────────────────────────
	print("  → verifying npm auth (`npm whoami`)…");
	const whoami = await exec("npm", ["whoami"], { cwd });
	if (whoami.exitCode !== 0) {
		const message =
			"npm is not authenticated. Run `npm login --auth-type=web` (browser flow, no token stored) or `npm login`, then re-run this command.";
		print(`  ✗ ${message}`);
		const packageNames = input.packages ?? discoverPublicPackages(cwd);
		return { status: "fail", message, packageNames };
	}
	const whoamiName = whoami.stdout.trim() || "<unknown>";
	print(`    ✓ authed as ${whoamiName}`);

	// ── 2. Resolve dynamic values needed for next-steps ─────────────────
	const packageNames = input.packages ?? discoverPublicPackages(cwd);
	const repoName = input.repoName ?? (await resolveRepoName(cwd, exec));

	// ── 3. Publish ──────────────────────────────────────────────────────
	if (dryRun) {
		print("");
		print("  … (dry-run) skipping actual publish");
		print(`    would run: pnpm ${publishArgs.join(" ")}`);
		printNextSteps(print, env, packageNames, repoName);
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
			print(`    pnpm exec tsx packages/cli/src/cli.ts npm publish-initial --otp <6-digit-code>`);
		}
		return { status: "fail", message, packageNames };
	}
	print("    ✓ publish complete");

	// ── 4. Next-step reminders ──────────────────────────────────────────
	printNextSteps(print, env, packageNames, repoName);
	return { status: "ok", packageNames };
}

// ── helpers ──────────────────────────────────────────────────────────

function discoverPublicPackages(cwd: string): readonly string[] {
	const packagesDir = join(cwd, "packages");
	if (!existsSync(packagesDir)) return [];
	return readdirSync(packagesDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.flatMap((e) => {
			const pkgPath = join(packagesDir, e.name, "package.json");
			if (!existsSync(pkgPath)) return [];
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
					name?: string;
					private?: boolean;
				};
				return !pkg.private && pkg.name ? [pkg.name] : [];
			} catch {
				return [];
			}
		});
}

async function resolveRepoName(cwd: string, exec: NonNullable<RunNpmPublishInitialInput["exec"]>): Promise<string> {
	const result = await exec("git", ["remote", "get-url", "origin"], { cwd });
	if (result.exitCode !== 0) return "unknown";
	// Matches both HTTPS (https://github.com/org/repo.git) and
	// SSH (git@github.com:org/repo.git) remote URL formats.
	const match = /[/:]([^/:]+?)(?:\.git)?$/.exec(result.stdout.trim());
	return match?.[1] ?? "unknown";
}

function printNextSteps(
	print: PublishInitialPrint,
	env: NodeJS.ProcessEnv,
	packageNames: readonly string[],
	repoName: string
): void {
	print("");
	print("  → next: configure Trusted Publisher for each package on npm:");
	for (const name of packageNames) {
		print(`    https://www.npmjs.com/package/${name}/access`);
	}
	print(`    Publisher: GitHub Actions   Org: theholocron   Repo: ${repoName}   Workflow: release.yml`);

	if (env.NPM_TOKEN) {
		print("");
		print("  → cleanup: $NPM_TOKEN was used. Revoke it now (no API for self-revoke; UI-only):");
		print("    https://www.npmjs.com/settings/~/tokens");
	}
}

const defaultExec: NonNullable<RunNpmPublishInitialInput["exec"]> = async (cmd, args, opts) => {
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
