import type { LaunchMenuConfig } from "../launch-menu/index.js";
import type { MenuEntry } from "../menu-entry/index.js";

/** The per-call knobs of a bound menu: everything in {@link LaunchMenuConfig} except what {@link createMenu} already fixed. */
export type BoundMenuOptions = Omit<LaunchMenuConfig, "bin" | "envPrefix">;

/** A menu engine bound to one CLI by {@link createMenu}. */
export interface Menu {
	/** {@link launchMenu} with the CLI's `bin` and `envPrefix` already applied. */
	launchMenu: (
		entries: MenuEntry[],
		parentArgv: Record<string, unknown>,
		options?: BoundMenuOptions
	) => Promise<void>;
	/** The env var a dry-run preview child gets (`<envPrefix>_DRY_RUN_PREVIEW`); see {@link dryRunPreviewEnvVar}. */
	dryRunPreviewEnvVar: string;
}
