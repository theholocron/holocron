import { homedir } from "node:os";
import { join } from "node:path";

import { checkForUpdates as checkPackageForUpdates } from "@theholocron/kyber/notifier";

import { env } from "../env/index.js";

const PACKAGE_NAME = "@theholocron/cli";

/**
 * Looks for a newer `@theholocron/cli` and returns a function that prints the notice, or `null` when there is none. The
 * answer is kept in `HOLOCRON_CACHE_DIR`, `~/.cache/holocron` by default.
 */
export function checkForUpdates(currentVersion: string): Promise<(() => void) | null> {
	return checkPackageForUpdates({
		name: PACKAGE_NAME,
		currentVersion,
		cacheDir: env.get("HOLOCRON_CACHE_DIR") ?? join(homedir(), ".cache", "holocron"),
		env: { CI: env.get("CI"), NO_UPDATE_NOTIFIER: env.get("NO_UPDATE_NOTIFIER") },
	});
}
