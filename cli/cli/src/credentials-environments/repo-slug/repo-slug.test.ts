import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it } from "vitest";

import { repoSlug } from "./repo-slug.js";

describe("repoSlug", () => {
	it("is the owner/repo of the origin remote", async () => {
		expect(await repoSlug("/r", async () => "https://github.com/theholocron/holocron.git\n")).toBe(
			"theholocron/holocron"
		);
	});

	it("is a ConfigError naming the environment option when the remote cannot be parsed", async () => {
		const err = await repoSlug("/r", async () => "/Users/me/repo").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/`environment` option/);
	});

	it("is the same error when there is no remote", async () => {
		const err = await repoSlug("/r", async () => Promise.reject(new Error("no such remote"))).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(ConfigError);
	});
});
