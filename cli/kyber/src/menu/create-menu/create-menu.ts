import { dryRunPreviewEnvVar } from "../dry-run-preview-env-var/index.js";
import type { LaunchMenuConfig } from "../launch-menu/index.js";
import { launchMenu } from "../launch-menu/index.js";
import type { Menu } from "./create-menu.type.js";

/**
 * Bind the menu engine to one CLI once, so callers stop repeating `bin` and `envPrefix`: the returned
 * `launchMenu(entries, parentArgv, options?)` is {@link launchMenu} with both applied, and `dryRunPreviewEnvVar` is the
 * matching env var name a dry-run preview child receives.
 *
 * @param binding - The CLI's binary name and env prefix.
 */
export function createMenu({ bin, envPrefix }: Pick<LaunchMenuConfig, "bin" | "envPrefix">): Menu {
	return {
		launchMenu: (entries, parentArgv, options = {}) =>
			launchMenu(entries, parentArgv, { bin, envPrefix, ...options }),
		dryRunPreviewEnvVar: dryRunPreviewEnvVar(envPrefix),
	};
}
