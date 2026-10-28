import { describe, expect, it, vi } from "vitest";

import type { Run } from "../../../utils/index.js";
import { fakeClock, fakeRun, VERSION } from "../test-fixtures.js";
import { waitForPublished } from "./wait-for-published.js";

describe("waitForPublished", () => {
	const PACKAGES = [
		{ name: "@theholocron/cli", version: VERSION },
		{ name: "@theholocron/datapad", version: VERSION },
	];

	it("returns at once, without sleeping, when npm already serves every version", async () => {
		const clock = fakeClock();

		const pending = await waitForPublished({ packages: PACKAGES, run: fakeRun(), ...clock });

		expect(pending).toEqual([]);
		expect(clock.sleep).not.toHaveBeenCalled();
	});

	it("polls until a version npm didn't serve at first shows up, asking only about what's still missing", async () => {
		const clock = fakeClock();
		let cliAsked = 0;
		const run = vi.fn<Run>((_command, args) => {
			const spec = args[1] ?? "";
			const served = !spec.includes("/cli@") || ++cliAsked >= 3;
			return served
				? { status: 0, stdout: `${VERSION}\n`, stderr: "" }
				: { status: 1, stdout: "", stderr: "E404" };
		});

		const pending = await waitForPublished({ packages: PACKAGES, run, ...clock, intervalMs: 10_000 });

		expect(pending).toEqual([]);
		expect(clock.sleep).toHaveBeenCalledTimes(2);
		// datapad was served on the first round, so only cli is asked about after it.
		expect(run.mock.calls.filter(([, args]) => args[1]?.includes("/datapad@"))).toHaveLength(1);
	});

	it("treats a different version from npm as not yet served", async () => {
		const run = vi.fn<Run>(() => ({ status: 0, stdout: "5.0.0-alpha.104\n", stderr: "" }));

		const pending = await waitForPublished({
			packages: [{ name: "@theholocron/cli", version: VERSION }],
			run,
			...fakeClock(),
			timeoutMs: 20_000,
			intervalMs: 10_000,
		});

		expect(pending).toEqual([`@theholocron/cli@${VERSION}`]);
	});

	it("gives up after the timeout, returning what's still missing", async () => {
		const clock = fakeClock();

		const pending = await waitForPublished({
			packages: PACKAGES,
			run: fakeRun({ served: false }),
			...clock,
			timeoutMs: 30_000,
			intervalMs: 10_000,
		});

		expect(pending).toEqual([`@theholocron/cli@${VERSION}`, `@theholocron/datapad@${VERSION}`]);
		expect(clock.sleep).toHaveBeenCalledTimes(3);
	});
});
