import { describe, expect, it } from "vitest";

import { describeTarget, resolveTarget } from "./target.js";

describe("resolveTarget", () => {
	it("reads owner/name from repo and defaults the service to github", () => {
		expect(resolveTarget({ repo: "theholocron/holocron" })).toEqual({
			service: "github",
			owner: "theholocron",
			repo: "holocron",
		});
	});

	it("takes the owner from the option, then the repo, then the org", () => {
		expect(resolveTarget({ owner: "a", repo: "b/c" })?.owner).toBe("a");
		expect(resolveTarget({ repo: "holocron", org: "theholocron" })?.owner).toBe("theholocron");
	});

	it("takes the service from the option", () => {
		expect(resolveTarget({ service: "gitlab", repo: "a/b" })?.service).toBe("gitlab");
	});

	it("is undefined without an owner or a repo name", () => {
		expect(resolveTarget({})).toBeUndefined();
		expect(resolveTarget({ repo: "holocron" })).toBeUndefined();
		expect(resolveTarget({ owner: "a" })).toBeUndefined();
	});

	it("describes a target as owner/repo", () => {
		expect(describeTarget({ service: "github", owner: "a", repo: "b" })).toBe("a/b");
	});
});
