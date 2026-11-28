import { NoopLogger } from "../core/logger.js";
import type { createLogger } from "../logger/create.js";

const SILENT_RUN_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Replace `createLogger` in the `/logger` module with one that returns a
 * {@link NoopLogger}, so code under test that builds a real Pino logger stops
 * writing NDJSON to stdout. Everything else the module exports passes through.
 *
 * The replacement is a plain function, not a `vi.fn`, so a consumer's
 * `resetMocks` / `restoreMocks` setting cannot wipe its implementation.
 *
 * `vi.mock` only takes effect in the consumer's own file, so call this from a
 * vitest setup file:
 *
 * ```ts
 * import { vi } from "vitest";
 *
 * vi.mock("@theholocron/observability/logger", async (importOriginal) => {
 *   const { silenceLogger } = await import("@theholocron/observability/testing");
 *   return silenceLogger(await importOriginal());
 * });
 * ```
 */
export function silenceLogger<T extends { createLogger: unknown }>(
	actual: T
): Omit<T, "createLogger"> & { createLogger: typeof createLogger } {
	return {
		...actual,
		createLogger: () => ({ logger: new NoopLogger(), runId: SILENT_RUN_ID }),
	};
}
