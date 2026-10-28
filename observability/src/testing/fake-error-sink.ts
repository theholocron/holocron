import type { Mock } from "vitest";
import { vi } from "vitest";

import type { CommandSpan, ErrorSink } from "../core/sinks.js";

/** A {@link CommandSpan} whose methods are spies. */
export interface FakeSpan extends CommandSpan {
	setStatus: Mock;
	end: Mock;
}

/** An {@link ErrorSink} whose methods are spies; `startSpan()` returns a {@link FakeSpan}. */
export interface FakeErrorSink extends ErrorSink {
	init: Mock;
	startSpan: Mock<(name: string) => FakeSpan>;
	captureException: Mock;
	endSession: Mock;
	flush: Mock<() => Promise<void>>;
}

/**
 * Build a spy {@link ErrorSink} for asserting what a unit under test reported.
 * `flush()` resolves immediately; `startSpan()` always returns the same spy
 * span (its own `setStatus` / `end` are separately assertable).
 *
 * ```ts
 * const errors = fakeErrorSink();
 * await deploy({ errors, branch: "main" });
 * expect(errors.captureException).not.toHaveBeenCalled();
 * ```
 */
export function fakeErrorSink(): FakeErrorSink {
	const span: FakeSpan = { setStatus: vi.fn(), end: vi.fn() };
	return {
		init: vi.fn(),
		startSpan: vi.fn(() => span),
		captureException: vi.fn(),
		endSession: vi.fn(),
		flush: vi.fn().mockResolvedValue(undefined),
	} as unknown as FakeErrorSink;
}
