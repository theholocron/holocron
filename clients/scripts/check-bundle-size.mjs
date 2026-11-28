#!/usr/bin/env node
// Defense in depth (holocron#762 investigation): if a dependency ever fails
// to externalize (deps.neverBundle misconfigured, a future tsdown/rolldown
// regression, etc.), the whole tree gets inlined instead. Every package
// here builds a thin client wrapper -- nothing legitimate should ever
// approach this threshold.
//
// Not this script's job to verify dist/ exists at all -- turbo's own task
// graph (verification.unitTests depends on delivery.build) already
// surfaces a build that didn't produce output. Treating a missing dist/
// as a failure here caused real false positives in CI: under heavy
// parallel I/O, this process can start before the just-exited tsdown
// process's writes are fully visible to a stat() from a new process.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST_DIR = "dist";
const MAX_BYTES = 512_000; // 500KB -- ~12x the largest real output seen (github-client, ~41KB)

let files;
try {
	files = readdirSync(DIST_DIR).filter((name) => name.endsWith(".mjs"));
} catch (error) {
	if (error.code === "ENOENT") {
		process.exit(0);
	}
	throw error;
}

let failed = false;
for (const file of files) {
	const path = join(DIST_DIR, file);
	const { size } = statSync(path);
	if (size > MAX_BYTES) {
		console.error(
			`check-bundle-size: ${path} is ${(size / 1_000_000).toFixed(2)}MB, exceeding the ${(MAX_BYTES / 1000).toFixed(0)}KB threshold -- ` +
				`a dependency likely failed to externalize (deps.neverBundle) and got inlined instead. Refs: holocron#762`
		);
		failed = true;
	}
}

if (failed) {
	process.exit(1);
}
