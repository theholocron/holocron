import { environment, withEnvPrefix } from "@theholocron/env-utils/lookup";
import { type ErrorSink, NoopErrorSink } from "@theholocron/observability/core";
import { SentrySink } from "@theholocron/observability/errors";

import type { EnvSource } from "../axiom-config/index.js";

/**
 * Sentinel's error sink: an initialised `SentrySink` when `SENTINEL_SENTRY_DSN` is set, otherwise a `NoopErrorSink`.
 *
 * `SENTINEL_SENTRY_DSN` only (holocron#1045): Sentinel has its own Sentry project, so its errors, alert rules and quota
 * stay apart from the CLI's, and the CLI's `HOLOCRON_SENTRY_DSN` / `SENTRY_DSN` and its shipped fallback key are
 * deliberately not read. Unset means no tracking, as with the Axiom transport: true in every test run and in any
 * environment before the secret has been synced.
 *
 * The environment name is `HOLOCRON_ENVIRONMENT` (then the bare `ENVIRONMENT`), `production` when neither names one,
 * because a DSN only reaches a deployment.
 *
 * @param env - The environment to read; tests pass a fake.
 * @returns A sink that is ready to use.
 */
export function resolveErrorSink(env: EnvSource): ErrorSink {
	const dsn = env.get("SENTINEL_SENTRY_DSN");
	if (!dsn) return new NoopErrorSink();
	const sink = new SentrySink();
	sink.init({
		dsn,
		release: "sentinel",
		environment: environment.normalize(withEnvPrefix(env, "HOLOCRON").get("ENVIRONMENT") ?? "") ?? "production",
		tags: { app: "sentinel" },
	});
	return sink;
}
