import { getLogger } from "../../../observability/logger/index.js";
import { defaultExec } from "../default-exec.js";
import { discoverPublicPackageEntries } from "../discover-public-package-entries.js";
import type { PublishReport } from "../publish.type.js";
import { redactOtp } from "../redact-otp.js";
import { workspaceFilterArgs } from "../workspace-filter-args.js";
import type { RunSteadyPublishInput } from "./run-steady-publish.type.js";

/**
 * `holocron package publish` (no `--initial`) — the steady-state publish
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
 * step involved. Reuses `workspaceFilterArgs()`'s monorepo-vs-single-package
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
		const message = "nothing to publish (no packages/*, plugins/*, or root package.json is private or unnamed)";
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
			const args = [...workspaceFilterArgs(cwd), "publish", ...baseFlags, ...otpFlags];
			print(`  … (dry-run) skipping actual publish`);
			print(`    would run: pnpm ${redactOtp(args, otp).join(" ")}`);
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
				// Lost a race with another concurrent publish of this exact
				// version (two CI jobs, a person + CI, etc.) between the npm
				// view above and this call -- re-check instead of assuming
				// failure: if it's actually published now, the end state is
				// exactly what skipAlreadyPublished wanted, just reached by a
				// different runner.
				const recheck = await exec("npm", ["view", `${entry.name}@${entry.version}`, "version"], { cwd });
				if (recheck.exitCode === 0 && recheck.stdout.trim()) {
					print(`    skip ${entry.name}@${entry.version} (published concurrently by another run)`);
					continue;
				}
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
	const args = [...workspaceFilterArgs(cwd), "publish", ...baseFlags, ...otpFlags];
	const publish = await exec("pnpm", args, { cwd });
	if (publish.exitCode !== 0) {
		const message = `publish failed (exit ${publish.exitCode}): ${publish.stderr.trim() || publish.stdout.trim() || "no output"}`;
		print(`  ✗ ${message}`);
		if (publish.stdout.includes("EOTP") || publish.stderr.includes("EOTP")) {
			print("");
			print("  → hint: your npm account requires 2FA for writes. Re-run with `--otp <code>`:");
			print(`    pnpm exec holocron package publish --otp <6-digit-code>`);
		}
		logger.warn({ tag, reason: message }, "publish: done");
		return { status: "fail", message, packageNames };
	}
	print("    ✓ publish complete");
	logger.info({ tag, status: "ok", packages: entries.length }, "publish: done");
	return { status: "ok", packageNames };
}
