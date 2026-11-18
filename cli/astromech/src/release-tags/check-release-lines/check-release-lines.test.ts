import { describe, expect, it } from "vitest";

import type { NpmDistTags, ReleaseLine } from "../release-tags.type.js";
import { checkReleaseLines } from "./check-release-lines.js";

const configs: ReleaseLine = { id: "configs", tagPrefix: "configs-v", packages: ["@x/a", "@x/b"] };
const npm = (entries: Record<string, NpmDistTags>) => new Map(Object.entries(entries));

describe("checkReleaseLines", () => {
	it("is published when npm serves the tag's version", () => {
		const result = checkReleaseLines({
			lines: [configs],
			tags: [{ name: "configs-v8.9.0-alpha.2" }],
			npm: npm({ "@x/a": { alpha: "8.9.0-alpha.2" }, "@x/b": { alpha: "8.9.0-alpha.2" } }),
		});
		expect(result).toEqual([
			{
				line: "configs",
				distTag: "alpha",
				tag: "configs-v8.9.0-alpha.2",
				version: "8.9.0-alpha.2",
				state: "published",
				behind: [],
			},
		]);
	});

	it("is published when npm is ahead of the tag", () => {
		const [check] = checkReleaseLines({
			lines: [configs],
			tags: [{ name: "configs-v8.9.0-alpha.2" }],
			npm: npm({ "@x/a": { alpha: "8.9.0-alpha.3" }, "@x/b": { alpha: "8.9.0-alpha.10" } }),
		});
		expect(check!.state).toBe("published");
	});

	it("is wedged when a tag is ahead of npm, naming the packages behind", () => {
		const [check] = checkReleaseLines({
			lines: [configs],
			tags: [{ name: "configs-v8.9.0-alpha.9" }, { name: "configs-v8.9.0-alpha.10" }],
			npm: npm({ "@x/a": { alpha: "8.9.0-alpha.10" }, "@x/b": { alpha: "8.9.0-alpha.9" } }),
		});
		expect(check).toMatchObject({ tag: "configs-v8.9.0-alpha.10", state: "wedged" });
		expect(check!.behind).toEqual([{ name: "@x/b", onNpm: "8.9.0-alpha.9" }]);
	});

	it("counts a package that is not on npm, or has no such dist-tag, as behind", () => {
		const [check] = checkReleaseLines({
			lines: [configs],
			tags: [{ name: "configs-v1.0.0" }],
			npm: npm({ "@x/a": undefined, "@x/b": { alpha: "1.0.0-alpha.1" } }),
		});
		expect(check!.state).toBe("wedged");
		expect(check!.behind).toEqual([
			{ name: "@x/a", onNpm: undefined },
			{ name: "@x/b", onNpm: undefined },
		]);
	});

	it("checks the stable and the prerelease channel apart", () => {
		const checks = checkReleaseLines({
			lines: [configs],
			tags: [{ name: "configs-v8.0.0" }, { name: "configs-v9.0.0-alpha.1" }],
			npm: npm({
				"@x/a": { latest: "8.0.0", alpha: "9.0.0-alpha.1" },
				"@x/b": { latest: "7.0.0", alpha: "9.0.0-alpha.1" },
			}),
		});
		expect(checks.map((c) => [c.distTag, c.state])).toEqual([
			["latest", "wedged"],
			["alpha", "published"],
		]);
	});

	it("takes the newest tag whichever order the tags come in", () => {
		const [check] = checkReleaseLines({
			lines: [configs],
			tags: [{ name: "configs-v1.0.0-alpha.10" }, { name: "configs-v1.0.0-alpha.9" }],
			npm: npm({}),
		});
		expect(check!.tag).toBe("configs-v1.0.0-alpha.10");
	});

	it("keeps one line's tags out of another's", () => {
		const repo: ReleaseLine = { id: "repo", tagPrefix: "v", packages: ["@x/cli"] };
		const checks = checkReleaseLines({
			lines: [repo],
			tags: [{ name: "configs-v9.0.0" }, { name: "v1.0.0" }, { name: "vnext" }, { name: "v2" }],
			npm: npm({ "@x/cli": { latest: "1.0.0" } }),
		});
		expect(checks).toHaveLength(1);
		expect(checks[0]!.tag).toBe("v1.0.0");
	});

	it("gives nothing for a line with no tag", () => {
		expect(checkReleaseLines({ lines: [configs], tags: [], npm: npm({}) })).toEqual([]);
	});

	it("calls a very new tag pending, and an old one wedged", () => {
		const base = {
			lines: [configs],
			npm: npm({ "@x/a": undefined, "@x/b": undefined }),
			now: 10_000,
			graceSeconds: 1800,
		};
		const stateOf = (createdAt?: number) =>
			checkReleaseLines({ ...base, tags: [{ name: "configs-v1.0.0", ...(createdAt ? { createdAt } : {}) }] })[0]!
				.state;
		expect(stateOf(9_000)).toBe("pending");
		expect(stateOf(1_000)).toBe("wedged");
		expect(stateOf()).toBe("wedged");
	});
});
