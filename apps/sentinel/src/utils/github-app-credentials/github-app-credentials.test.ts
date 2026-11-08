import { describe, expect, it } from "vitest";

import { githubAppCredentials } from "./github-app-credentials.js";

function failure(env: Record<string, string>): Error | undefined {
	try {
		githubAppCredentials(env);
	} catch (e) {
		return e as Error;
	}
}

describe("githubAppCredentials", () => {
	it("takes the SENTINEL_ names first", () => {
		expect(
			githubAppCredentials({
				SENTINEL_GITHUB_APP_ID: "1",
				SENTINEL_GITHUB_APP_PRIVATE_KEY: "new-key",
				GITHUB_APP_ID: "2",
				GITHUB_APP_PRIVATE_KEY: "old-key",
			})
		).toEqual({ appId: "1", privateKey: "new-key" });
	});

	it("falls back to the bare names a deployment set before the rename", () => {
		expect(githubAppCredentials({ GITHUB_APP_ID: "2", GITHUB_APP_PRIVATE_KEY: "old-key" })).toEqual({
			appId: "2",
			privateKey: "old-key",
		});
	});

	it("reads each name on its own, so a half-renamed environment still works", () => {
		expect(githubAppCredentials({ SENTINEL_GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: "old-key" })).toEqual({
			appId: "1",
			privateKey: "old-key",
		});
	});

	it("names both spellings when the id is missing, and never the key", () => {
		const err = failure({ GITHUB_APP_PRIVATE_KEY: "secret-key" });
		expect(err?.message).toMatch(/SENTINEL_GITHUB_APP_ID \(or GITHUB_APP_ID\)/);
		expect(err?.message).not.toContain("secret-key");
	});

	it("names both spellings when the private key is missing", () => {
		expect(failure({ GITHUB_APP_ID: "2" })?.message).toMatch(
			/SENTINEL_GITHUB_APP_PRIVATE_KEY \(or GITHUB_APP_PRIVATE_KEY\)/
		);
	});
});
