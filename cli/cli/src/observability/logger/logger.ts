/**
 * CLI-side wiring for `@theholocron/observability/logger`.
 *
 * `logger` is the operational-output channel — internal state, debug
 * traces, errors, structured context that routes to Axiom. It runs in
 * parallel to `print` (user-facing UX output) and does not replace it.
 */

import { createEnvLookup, holocronEnv, PREFIX } from "@theholocron/env-utils/lookup";
import { type BuildCliLoggerOpts, type CliLoggerContext, createCliLogger } from "@theholocron/kyber/observability";
import { type AxiomTransportConfig, resolveAxiomFromEnv } from "@theholocron/observability/logger";

import { keyring, resolveValue } from "../../auth/index.js";
import { contextForCommand } from "../../commands/contexts/index.js";

const env = createEnvLookup();
const holocron = holocronEnv();

/**
 * The CLI's Axiom dataset (`holocron`; each service has its own): the process environment (`HOLOCRON_AXIOM_DATASET`, then the unprefixed `AXIOM_DATASET`,
 * through the prefix lookup), then the repo's `log.axiom.dataset`, then the credential chain, which is asked for the
 * same pair of names through `resolveValue`'s `prefix` option.
 *
 * A service's environments ship to the same dataset and are told apart by the `env` field on each line (ADR-0019). The
 * config dataset is only a per-repo override, so a `global`-context command (`clone`, `new token`, `upgrade node`, ...,
 * ADR-0012) leaves it out: it is not about any repo, and the repo it happens to run in must not choose where its
 * lines go.
 */
export function resolveCliDataset(opts: BuildCliLoggerOpts, isGlobal: boolean): string | undefined {
	return (
		holocron.get("AXIOM_DATASET") ??
		(isGlobal ? undefined : opts.configAxiomDataset) ??
		resolveValue(["AXIOM_DATASET"], undefined, { prefix: PREFIX })
	);
}

/**
 * Resolve Axiom credentials for the CLI.
 *
 * Env vars win (same contract as `@theholocron/observability`'s `resolveAxiomFromEnv`), falling back to the CLI-only
 * bridge that pairs the OS-keyring token (`axiom.<org>` then bare `axiom`) with the dataset from
 * {@link resolveCliDataset}. Returns `undefined` unless both a token and a dataset are found, so a local run with
 * neither stays off Axiom.
 */
function resolveCliAxiom(opts: BuildCliLoggerOpts, ctx: CliLoggerContext): AxiomTransportConfig | undefined {
	const fromEnv = resolveAxiomFromEnv();
	if (fromEnv) return fromEnv;

	const isGlobal = contextForCommand(ctx.command ?? "") === "global";
	const dataset = resolveCliDataset(opts, isGlobal);
	if (!dataset) return undefined;

	const org = opts.org ?? env.get(`${PREFIX}_ORG`);
	const token = holocron.get("AXIOM_TOKEN") || (org ? keyring.get(`axiom.${org}`) : null) || keyring.get("axiom");
	return token ? { dataset, token } : undefined;
}

const logger = createCliLogger({ envPrefix: PREFIX, resolveAxiom: resolveCliAxiom });

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
