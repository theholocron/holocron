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

/** A token read from an Environment, with where it came from (names only, never the value). */
export interface EnvironmentToken {
	token: string;
	/** The Environment's resolved name. */
	environment: string;
	/** The variable the token was in. */
	variable: string;
}
