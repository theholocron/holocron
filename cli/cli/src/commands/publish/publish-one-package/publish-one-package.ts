import { isTlogConflict } from "../is-tlog-conflict.js";
import type { PublishOnePackageInput, PublishOnePackageResult } from "./publish-one-package.type.js";

/** Default waits before the two retries of a sigstore 409. */
export const DEFAULT_BACKOFF_MS: readonly number[] = [5000, 15000];

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Publishes one package and settles what a failure means (#1387). After every failed call it asks the registry
 * (`npm view <name>@<version>`): a version that is there counts as published (another run made it). Only a sigstore 409
 * (`TLOG_CREATE_ENTRY_ERROR`) is tried again, after a short backoff; any other failure ends the package at once. A 409
 * that survives every retry is reported as `tlog-conflict`: the same bytes are already in the transparency log, which a
 * retry cannot change.
 */
export async function publishOnePackage(input: PublishOnePackageInput): Promise<PublishOnePackageResult> {
	const { entry, exec, cwd, print } = input;
	const sleep = input.sleep ?? defaultSleep;
	const backoff = input.backoffMs ?? DEFAULT_BACKOFF_MS;
	const label = `${entry.name}@${entry.version}`;

	for (let attempt = 0; ; attempt += 1) {
		const publish = await exec("pnpm", [...input.publishArgs], { cwd });
		if (publish.exitCode === 0) return { outcome: "published" };

		const view = await exec("npm", ["view", label, "version"], { cwd });
		if (view.exitCode === 0 && view.stdout.trim()) return { outcome: "concurrent" };

		const output = `${publish.stderr}\n${publish.stdout}`;
		const message = `publish failed for ${label} (exit ${publish.exitCode}): ${publish.stderr.trim() || publish.stdout.trim() || "no output"}`;
		if (!isTlogConflict(output)) return { outcome: "failed", message };

		const wait = backoff[attempt];
		if (wait === undefined) return { outcome: "tlog-conflict", message };
		print(`    … ${label} hit a sigstore 409; retrying in ${wait / 1000}s (${attempt + 1} of ${backoff.length})`);
		await sleep(wait);
	}
}
