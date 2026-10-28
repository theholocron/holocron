import { getLogger } from "../../../observability/logger/index.js";
import { defaultExec } from "../default-exec.js";
import { discoverPublicPackages } from "../discover-public-packages.js";
import { isEotp } from "../is-eotp.js";
import { parseJson } from "../parse-json.js";
import { scopeOf } from "../scope-of.js";
import type {
	NpmTrustEntry,
	NpmTrustError,
	RunSyncTrustInput,
	SyncTrustPackageResult,
	SyncTrustReport,
} from "./run-sync-trust.type.js";

/**
 * `holocron package publish --sync-trust <old-file> <new-file>` — bulk-migrates npm
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
	const packageNames = input.packages ?? discoverPublicPackages(cwd, scopeOf(input));
	const npm = "npx";
	const npmArgs = ["-y", "npm@latest"];

	print(`Holocron publish --sync-trust${dryRun ? " (dry-run)" : ""}`);
	print(`  ${input.oldFile} -> ${input.newFile}  (repo: ${repo})`);
	print(`  ${packageNames.length} public packages`);
	print("");
	logger.info({ oldFile: input.oldFile, newFile: input.newFile, packages: packageNames.length }, "sync-trust: start");

	if (packageNames.length === 0) {
		const message = "nothing to sync (no packages/*, plugins/*, or root package.json is private or unnamed)";
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
