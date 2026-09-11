/**
 * Vitest setup file — silence `@theholocron/observability/logger` for the CLI suite.
 *
 * `runStep`, `runDoctor`, and other command code call `getLogger()` from
 * `src/logger.ts`, which builds a real Pino instance that writes NDJSON to
 * stdout. In tests that floods the output. Mock `createLogger` to return
 * `NoopLogger` (from `/core` — discards everything, `child()` returns
 * itself); the real level-resolution / env logic is still covered by
 * `context.test.ts` in `@theholocron/observability/logger` and by `logger.test.ts`
 * (which overrides this mock with its own recording fake).
 */

import { NoopLogger } from "@theholocron/observability/core";
import { vi } from "vitest";

vi.mock("@theholocron/observability/logger", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@theholocron/observability/logger")>();
	return {
		...actual,
		createLogger: vi.fn(() => ({ logger: new NoopLogger(), runId: "00000000-0000-4000-8000-000000000000" })),
	};
});
