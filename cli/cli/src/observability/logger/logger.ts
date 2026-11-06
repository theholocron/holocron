/**
 * CLI-side wiring for `@theholocron/observability/logger`.
 *
 * `logger` is the operational-output channel — internal state, debug
 * traces, errors, structured context that routes to Axiom. It runs in
 * parallel to `print` (user-facing UX output) and does not replace it.
 */

import { createEnvLookup, withEnvPrefix } from "@theholocron/env-utils/lookup";
import { type BuildCliLoggerOpts, type CliLoggerContext, createCliLogger } from "@theholocron/kyber/observability";
import { type AxiomTransportConfig, resolveAxiomFromEnv } from "@theholocron/observability/logger";

import { keyring } from "../../auth.js";
import { contextForCommand } from "../../commands/contexts/index.js";

const env = createEnvLookup();
const holocronEnv = withEnvPrefix(env, "HOLOCRON");

/**
 * Dataset for `global`-context commands (`clone`, `auth set`, `upgrade
 * node`, …) — ADR-0012. These commands aren't "about" any repo, so their
 * logs must never depend on `$PWD` or which repo's `.envrc` happens to be
 * active; they always ship to holocron's own dataset instead of whatever
 * `HOLOCRON_AXIOM_DATASET` resolves to locally. Mirrors
 * `resolve-telemetry.ts`'s `FALLBACK_DSN` — a holocron-owned default, not a
 * per-repo override.
 */
export const GLOBAL_AXIOM_DATASET = "holocron-global";

/**
 * Resolve Axiom credentials for the CLI.
 *
 * A `global`-context command (ADR-0012) always resolves to
 * {@link GLOBAL_AXIOM_DATASET}, ignoring `HOLOCRON_AXIOM_DATASET` /
 * `AXIOM_DATASET` / `holocron.config` `log.axiom.dataset` entirely — it
 * isn't "about" any repo, so the active directory's dataset is never the
 * right answer. Everything else keeps the existing chain: env vars win
 * (same contract as `@theholocron/observability`'s `resolveAxiomFromEnv`),
 * falling back to the CLI-only bridge that pairs the OS-keyring token
 * (`axiom.<org>` then bare `axiom`) with a dataset from
 * `HOLOCRON_AXIOM_DATASET` / `AXIOM_DATASET` or `log.axiom.dataset`.
 * Returns `undefined` unless both a token and a dataset are found.
 */
function resolveCliAxiom(opts: BuildCliLoggerOpts, ctx: CliLoggerContext): AxiomTransportConfig | undefined {
	const isGlobal = contextForCommand(ctx.command ?? "") === "global";

	if (!isGlobal) {
		const fromEnv = resolveAxiomFromEnv();
		if (fromEnv) return fromEnv;
	}

	const dataset = isGlobal ? GLOBAL_AXIOM_DATASET : (holocronEnv.get("AXIOM_DATASET") ?? opts.configAxiomDataset);
	if (!dataset) return undefined;

	const org = opts.org ?? env.get("HOLOCRON_ORG");
	const token = holocronEnv.get("AXIOM_TOKEN") || (org ? keyring.get(`axiom.${org}`) : null) || keyring.get("axiom");
	return token ? { dataset, token } : undefined;
}

const logger = createCliLogger({ envPrefix: "HOLOCRON", resolveAxiom: resolveCliAxiom });

/**
 * The process-wide root logger, built once from `cli.ts`'s middleware and
 * rebuilt at most once more when a handler supplies `holocron.config` context.
 * See `createCliLogger` in `@theholocron/kyber/observability`.
 */
export const buildCliLogger = logger.buildCliLogger;

/** Lazily-memoized `Logger` for call sites with no `argv` in scope (yargs' `.fail()`). */
export const getLogger = logger.getLogger;

/** Report a fatal, command-ending CLI error: printed with `style.fail` and logged. */
export const reportError = logger.reportError;

/** The current root logger's correlation id, if a root has been built. */
export const getRunId = logger.getRunId;

/** Test hook: drop the memoized root so the next call rebuilds it. */
export const resetCliLogger = logger.resetCliLogger;

/** Level from `--log` / `--verbose` / `--quiet`, then `HOLOCRON_LOG_LEVEL`, then config. */
export const resolveLogLevel = logger.resolveLogLevel;
