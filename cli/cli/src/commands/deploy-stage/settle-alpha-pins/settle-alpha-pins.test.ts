import { describe, expect, it, vi } from "vitest";

import type { AlphaRelease } from "../alpha-release/index.js";
import { DEFAULT_PIN_WAITS_MS, settleAlphaPins } from "./settle-alpha-pins.js";

const installed = { "@theholocron/astromech": "5.0.0-alpha.1", "@theholocron/cli": "5.0.0-alpha.1" };

/** Astromech peers on exactly one CLI version; the CLI's tag is what a release moves. */
const release =
	(astromechPeer: string, cli: string) =>
	(name: string): AlphaRelease =>
		name === "@theholocron/astromech"
			? { version: "5.0.0-alpha.440", peerDependencies: { "@theholocron/cli": astromechPeer } }
			: { version: cli };

describe("settleAlphaPins", () => {
	it("returns at once, and never waits, when the tags already agree", () => {
		const sleep = vi.fn();
		const result = settleAlphaPins(installed, release("5.0.0-alpha.440", "5.0.0-alpha.440"), { sleep });
		expect(result.mismatches).toEqual([]);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("looks again after a wait and returns the pins once a release has finished", () => {
		const sleep = vi.fn();
		const lines: string[] = [];
		const lookup = vi
			.fn<(name: string) => AlphaRelease>()
			// first pass: astromech@440 peers cli@440, cli is already at 441
			.mockImplementationOnce(release("5.0.0-alpha.440", "5.0.0-alpha.441"))
			.mockImplementationOnce(release("5.0.0-alpha.440", "5.0.0-alpha.441"))
			// second pass: the release has finished
			.mockImplementation(release("5.0.0-alpha.441", "5.0.0-alpha.441"));
		const result = settleAlphaPins(installed, lookup, { sleep, waits: [10, 20], print: (l) => lines.push(l) });
		expect(result.mismatches).toEqual([]);
		expect(result.dependencies["@theholocron/cli"]).toBe("5.0.0-alpha.441");
		expect(sleep).toHaveBeenCalledTimes(1);
		expect(sleep).toHaveBeenCalledWith(10);
		expect(lines.join("\n")).toContain("do not agree yet");
	});

	it("fails naming each mismatch when the tags still disagree after the last try", () => {
		const sleep = vi.fn();
		const failure = () =>
			settleAlphaPins(installed, release("5.0.0-alpha.440", "5.0.0-alpha.441"), { sleep, waits: [1, 2] });
		expect(failure).toThrow(/still do not agree/);
		expect(failure).toThrow(
			/@theholocron\/astromech@5\.0\.0-alpha\.440 peers @theholocron\/cli@5\.0\.0-alpha\.440/
		);
		expect(sleep).toHaveBeenCalledTimes(4);
	});

	it("tries once and then fails when there are no waits", () => {
		const sleep = vi.fn();
		expect(() =>
			settleAlphaPins(installed, release("5.0.0-alpha.440", "5.0.0-alpha.441"), { sleep, waits: [] })
		).toThrow(/still do not agree/);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("waits on the thread by default, for the stated time", () => {
		const start = Date.now();
		const lookup = vi
			.fn<(name: string) => AlphaRelease>()
			.mockImplementationOnce(release("5.0.0-alpha.440", "5.0.0-alpha.441"))
			.mockImplementationOnce(release("5.0.0-alpha.440", "5.0.0-alpha.441"))
			.mockImplementation(release("5.0.0-alpha.441", "5.0.0-alpha.441"));
		settleAlphaPins(installed, lookup, { waits: [30] });
		expect(Date.now() - start).toBeGreaterThanOrEqual(25);
	});

	it("keeps waits that give a release a few minutes", () => {
		expect(DEFAULT_PIN_WAITS_MS.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(120_000);
	});
});
