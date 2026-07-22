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
}

export type PublishInitialStatus = "ok" | "fail" | "dry-run";

export interface NpmPublishInitialReport {
	status: PublishInitialStatus;
	message?: string;
	/** Packages that the publish step targeted. */
	packageNames: readonly string[];
}

const PUBLISHABLE_PACKAGES = [
	"@theholocron/cli",
	"@theholocron/holocron-plugin-github",
	"@theholocron/holocron-plugin-vercel",
	"@theholocron/holocron-plugin-neon",
	"@theholocron/holocron-plugin-clerk",
	"@theholocron/holocron-plugin-1password",
	"@theholocron/holocron-plugin-postman",
] as const;

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
		return { status: "fail", message, packageNames: PUBLISHABLE_PACKAGES };
	}
	const whoamiName = whoami.stdout.trim() || "<unknown>";
	print(`    ✓ authed as ${whoamiName}`);

	// ── 2. Publish ──────────────────────────────────────────────────────
	if (dryRun) {
		print("");
		print("  … (dry-run) skipping actual publish");
		print(`    would run: pnpm ${publishArgs.join(" ")}`);
		printNextSteps(print, env);
		return {
			status: "dry-run",
			message: "dry-run — no publish executed",
			packageNames: PUBLISHABLE_PACKAGES,
		};
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
		return { status: "fail", message, packageNames: PUBLISHABLE_PACKAGES };
	}
	print("    ✓ publish complete");

	// ── 3. Next-step reminders ──────────────────────────────────────────
	printNextSteps(print, env);
	return { status: "ok", packageNames: PUBLISHABLE_PACKAGES };
}

// ── helpers ──────────────────────────────────────────────────────────

function printNextSteps(print: PublishInitialPrint, env: NodeJS.ProcessEnv): void {
	print("");
	print("  → next: configure Trusted Publisher for each package on npm:");
	for (const name of PUBLISHABLE_PACKAGES) {
		print(`    https://www.npmjs.com/package/${name}/access`);
	}
	print("    Publisher: GitHub Actions   Org: theholocron   Repo: holocron   Workflow: release.yml");

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
