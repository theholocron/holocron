/**
 * Vitest setup file — silence `@theholocron/observability/logger` for the CLI suite.
 *
 * `runStep`, `runDoctor`, and other command code call `getLogger()` from
 * `src/logger.ts`, which builds a real Pino instance that writes NDJSON to
 * stdout. In tests that floods the output. Mock `createLogger` to a no-op
 * logger; the real level-resolution / env logic is still covered by
 * `context.test.ts` in `@theholocron/observability/logger` and by `logger.test.ts`
 * (which overrides this mock with its own recording fake).
 */

import { vi } from "vitest";

vi.mock("@theholocron/observability/logger", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@theholocron/observability/logger")>();
	const noop = (): void => {};
	const makeLogger = (): import("@theholocron/observability/logger").Logger => {
		const logger = { debug: noop, info: noop, warn: noop, error: noop, child: () => logger };
		return logger;
	};
	return {
		...actual,
		createLogger: vi.fn(() => ({ logger: makeLogger(), runId: "00000000-0000-4000-8000-000000000000" })),
	};
});
