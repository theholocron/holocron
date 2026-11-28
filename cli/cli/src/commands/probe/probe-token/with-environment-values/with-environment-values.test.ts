import { afterEach, describe, expect, it } from "vitest";

import { withEnvironmentValues } from "./with-environment-values.js";

afterEach(() => {
	delete process.env.PROBE_OVERLAY_A;
	delete process.env.PROBE_OVERLAY_B;
});

describe("withEnvironmentValues", () => {
	it("sets the values for the run and puts a replaced one and a new one back afterwards", async () => {
		process.env.PROBE_OVERLAY_A = "machine";
		const seen = await withEnvironmentValues({ PROBE_OVERLAY_A: "env", PROBE_OVERLAY_B: "new" }, async () => [
			process.env.PROBE_OVERLAY_A,
			process.env.PROBE_OVERLAY_B,
		]);
		expect(seen).toEqual(["env", "new"]);
		expect(process.env.PROBE_OVERLAY_A).toBe("machine");
		expect("PROBE_OVERLAY_B" in process.env).toBe(false);
	});

	it("restores the names when the run throws", async () => {
		await expect(
			withEnvironmentValues({ PROBE_OVERLAY_B: "x" }, async () => {
				throw new Error("boom");
			})
		).rejects.toThrow("boom");
		expect("PROBE_OVERLAY_B" in process.env).toBe(false);
	});

	it("just runs when there is nothing to set", async () => {
		expect(await withEnvironmentValues(undefined, async () => 1)).toBe(1);
		expect(await withEnvironmentValues({}, async () => 2)).toBe(2);
	});
});
