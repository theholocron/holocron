import type { GitExec } from "@theholocron/git-utils";

import type { Vault } from "../../../plugin/index.js";
import type { PluginToken } from "../../auth/index.js";

/** What a person picked when asked which token a probe should check: another token, or one read from an Environment. */
export interface ChosenToken {
	/** A layer word or an Environment name to read the provider's token from. */
	environment?: string;
	/** A token typed or pasted in. */
	token?: string;
}

/** Asks which token a probe that accepts one should check; resolves to nothing when the configured one is wanted. */
export type ChooseToken = (provider: string) => Promise<ChosenToken | undefined>;

export interface EnvironmentTokenInput {
	/** Which provider's token to look for. */
	provider: string;
	/** A layer word (`ci`) or an Environment name, as `sync secrets` takes it. */
	environment: string;
	repoRoot: string;
	/** Reads the remote a layer word is resolved from; tests inject one. */
	gitExec?: GitExec;
	/** The Environments the config names (anything but a layer word must be one of these). */
	configured: readonly string[];
	/** The configured vault; it must be able to read a whole Environment. */
	vault: Vault | undefined;
	/** The tokens the provider's plugin lists, whose variable names are looked for in the Environment. */
	tokens: readonly PluginToken[];
}

/** The declared tokens one Environment holds and the ones it does not (names only, never a value). */
export interface EnvironmentTokens {
	/** The Environment's resolved name. */
	environment: string;
	/** Each declared token the Environment holds, in the plugin's order. */
	held: Array<{
		token: string;
		/** The variable the token was in (the plugin's own, or the vendor's). */
		variable: string;
		/** The declared token's `envName`, its identity in the plugin's `tokens` list. */
		envName: string;
	}>;
	/** The `envName` of each declared token the Environment does not hold. */
	missing: string[];
}
