/**
 * Vitest setup file — silence `@theholocron/observability/logger` for the CLI suite.
 *
 * `runStep`, `runDoctor`, and other command code call `getLogger()` from
 * `src/observability/logger.ts`, which builds a real Pino instance that writes NDJSON to
 * stdout. In tests that floods the output, so swap `createLogger` for a
 * `NoopLogger` via `silenceLogger`. `logger.test.ts` overrides this mock with
 * its own recording fake.
 */

import { vi } from "vitest";

vi.mock("@theholocron/observability/logger", async (importOriginal) => {
	const { silenceLogger } = await import("@theholocron/observability/testing");
	return silenceLogger(await importOriginal<typeof import("@theholocron/observability/logger")>());
});
