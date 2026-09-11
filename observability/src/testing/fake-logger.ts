import type { Mock } from "vitest";
import { vi } from "vitest";

import type { Logger } from "../core/logger.js";

/** A {@link Logger} whose level methods are spies; `child()` returns itself. */
export interface FakeLogger extends Logger {
	debug: Mock;
	info: Mock;
	warn: Mock;
	error: Mock;
	child: Mock;
}

/**
 * Build a spy {@link Logger} for asserting what a unit under test logged.
 * Pass it wherever a real `Logger` is expected.
 *
 * ```ts
 * const log = fakeLogger();
 * await deploy({ logger: log, target: "production" });
 * expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ target: "production" }), "deploying");
 * ```
 */
export function fakeLogger(): FakeLogger {
	const log = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(() => log),
	} as unknown as FakeLogger;
	return log;
}
