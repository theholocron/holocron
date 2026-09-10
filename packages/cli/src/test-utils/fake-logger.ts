import type { Logger } from "@theholocron/observability/core";
import { type Mock, vi } from "vitest";

/** A {@link Logger} whose level methods are spies; `child()` returns itself. */
export interface FakeLogger extends Logger {
	info: Mock;
	warn: Mock;
	error: Mock;
	debug: Mock;
	child: Mock;
}

/**
 * Build a spy logger for asserting a command's structured output. Pass it as
 * the `logger` field of a `run*` input (sibling of `print`).
 *
 * ```ts
 * const log = fakeLogger();
 * await runSync({ ...input, logger: log });
 * expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ config: "demo" }), "sync: start");
 * ```
 */
export function fakeLogger(): FakeLogger {
	const log = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		child: vi.fn(() => log),
	} as unknown as FakeLogger;
	return log;
}
