import { spawnSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { alphaRelease } from "./alpha-release.js";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const spawn = vi.mocked(spawnSync);

const reply = (reply: { status?: number | null; stdout?: string; stderr?: string; error?: Error }) =>
	spawn.mockReturnValueOnce({ status: 0, stdout: "", stderr: "", ...reply } as ReturnType<typeof spawnSync>);

beforeEach(() => spawn.mockReset());

describe("alphaRelease", () => {
	it("asks npm for the alpha tag's version and peers, as JSON", () => {
		reply({
			stdout: JSON.stringify({
				version: "5.0.0-alpha.393",
				peerDependencies: { "@theholocron/cli": "5.0.0-alpha.393" },
			}),
		});
		expect(alphaRelease("@theholocron/holocron-plugin-discord")).toEqual({
			version: "5.0.0-alpha.393",
			peerDependencies: { "@theholocron/cli": "5.0.0-alpha.393" },
		});
		expect(spawn).toHaveBeenCalledWith(
			"npm",
			["view", "@theholocron/holocron-plugin-discord@alpha", "version", "peerDependencies", "--json"],
			expect.objectContaining({ encoding: "utf8" })
		);
	});

	it("returns just the version for a release with no peers, and for a bare string", () => {
		reply({ stdout: JSON.stringify({ version: "1.0.0-alpha.2" }) });
		expect(alphaRelease("@theholocron/json-utils")).toEqual({ version: "1.0.0-alpha.2" });
		reply({ stdout: '"1.0.0-alpha.3"' });
		expect(alphaRelease("@theholocron/json-utils")).toEqual({ version: "1.0.0-alpha.3" });
	});

	it("ignores a peerDependencies value that is not an object", () => {
		reply({ stdout: JSON.stringify({ version: "1.0.0-alpha.2", peerDependencies: "none" }) });
		expect(alphaRelease("@theholocron/json-utils")).toEqual({ version: "1.0.0-alpha.2" });
	});

	it("returns undefined when the reply holds no version", () => {
		reply({ stdout: JSON.stringify({}) });
		expect(alphaRelease("@theholocron/json-utils")).toBeUndefined();
	});

	it("returns undefined when the package or its alpha tag does not exist (E404)", () => {
		reply({ status: 1, stderr: "npm error code E404\nnpm error 404 No match found for version alpha" });
		expect(alphaRelease("@theholocron/holocron-config")).toBeUndefined();
	});

	it("fails clearly when the registry cannot be reached", () => {
		reply({ status: 1, stderr: "\nnpm error code ENOTFOUND\nnpm error network request failed" });
		const err = (() => {
			try {
				alphaRelease("@theholocron/cli");
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).message).toMatch(/cannot look up @theholocron\/cli@alpha on npm .*ENOTFOUND/);
	});

	it("falls back to the exit status when npm printed nothing", () => {
		reply({ status: 7 });
		expect(() => alphaRelease("@theholocron/cli")).toThrow(/exit 7/);
	});

	it("fails clearly when npm cannot be run", () => {
		reply({ status: null, error: new Error("spawn npm ENOENT") });
		expect(() => alphaRelease("@theholocron/cli")).toThrow(
			/cannot run npm to look up @theholocron\/cli@alpha: spawn npm ENOENT/
		);
	});
});
