import type { LogLevel } from "@theholocron/observability/core";

export interface BuildCliLoggerOpts {
	/** Active command name — bound on the root as `command` for every line. */
	command?: string;
	/** `holocron.config` `log.level`, from a handler that has loaded a config. */
	configLevel?: LogLevel;
	/**
	 * `holocron.config` `log.axiom.dataset` — the non-secret Axiom dataset
	 * name. Paired with a keyring token when the env vars are absent.
	 */
	configAxiomDataset?: string;
	/**
	 * Resolved org (`--org` → `HOLOCRON_ORG` → config `org`) for the
	 * namespaced keyring lookup (`axiom.<org>` before bare `axiom`).
	 */
	org?: string;
}
