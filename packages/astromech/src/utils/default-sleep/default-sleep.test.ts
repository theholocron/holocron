import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSleep } from "./default-sleep.js";

describe("defaultSleep", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("defaultSleep resolves after the delay", async () => {
		vi.useFakeTimers();
		let done = false;
		const sleeping = defaultSleep(1000).then(() => (done = true));
		await vi.advanceTimersByTimeAsync(999);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await sleeping;
		expect(done).toBe(true);
	});
});
