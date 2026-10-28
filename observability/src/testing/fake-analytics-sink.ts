import type { Mock } from "vitest";
import { vi } from "vitest";

import type { AnalyticsSink } from "../core/sinks.js";

/** An {@link AnalyticsSink} whose methods are spies. */
export interface FakeAnalyticsSink extends AnalyticsSink {
	identify: Mock;
	capture: Mock;
	shutdown: Mock<() => Promise<void>>;
}

/**
 * Build a spy {@link AnalyticsSink} for asserting what a unit under test
 * reported. `shutdown()` resolves immediately.
 *
 * ```ts
 * const analytics = fakeAnalyticsSink();
 * await deploy({ analytics, branch: "main" });
 * expect(analytics.capture).toHaveBeenCalledWith("abc123", "deploy_triggered", { branch: "main" });
 * ```
 */
export function fakeAnalyticsSink(): FakeAnalyticsSink {
	return {
		identify: vi.fn(),
		capture: vi.fn(),
		shutdown: vi.fn().mockResolvedValue(undefined),
	} as unknown as FakeAnalyticsSink;
}
