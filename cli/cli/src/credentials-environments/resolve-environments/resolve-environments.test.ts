import { describe, expect, it, vi } from "vitest";

import { resolveEnvironments } from "./resolve-environments.js";

const gitExec = async () => "git@github.com:theholocron/holocron.git";

describe("resolveEnvironments", () => {
	it("returns the explicit name alone, without reading the remote", async () => {
		const exec = vi.fn(gitExec);
		expect(await resolveEnvironments("1password", "Mine", { repoRoot: "/r", gitExec: exec })).toEqual([
			{ name: "Mine", optional: false },
		]);
		expect(exec).not.toHaveBeenCalled();
	});

	it("derives the layer's names and no others", async () => {
		const names = (await resolveEnvironments("1password", undefined, { repoRoot: "/r", env: {}, gitExec })).map(
			(x) => x.name
		);
		expect(names).toEqual(["theholocron/holocron - local", "theholocron/holocron - dev"]);
	});

	it("derives nothing for a provider that does not derive", async () => {
		expect(await resolveEnvironments("doppler", undefined, { repoRoot: "/r", gitExec })).toEqual([]);
	});

	it("derives nothing in the test layer", async () => {
		const env = { HOLOCRON_ENVIRONMENT: "test" };
		expect(await resolveEnvironments("1password", undefined, { repoRoot: "/r", env, gitExec })).toEqual([]);
	});
});
