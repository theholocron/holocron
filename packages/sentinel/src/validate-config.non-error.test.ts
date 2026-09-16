import { describe, expect, it, vi } from "vitest";

// loadConfigFile only ever throws real Error instances in practice (it wraps
// every failure in ConfigFileError) — this covers the defensive
// `String(err)` fallback for a hypothetical non-Error throw, in its own file
// so the mock doesn't affect validate-config.test.ts's real-loader coverage.
vi.mock("@theholocron/datapad", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@theholocron/datapad")>();
	return {
		...actual,
		loadConfigFile: vi.fn().mockRejectedValue("a plain string, not an Error"),
	};
});

describe("validateConfig — non-Error throw from loadConfigFile", () => {
	it("falls back to String(err) when loadConfigFile rejects with a non-Error value", async () => {
		const { createGitHubClient } = await import("@theholocron/github-client");
		const { stubFetch } = await import("@theholocron/http-client/testing");
		const { validateConfig } = await import("./validate-config.js");

		const content = Buffer.from(JSON.stringify({ name: "demo", tasks: [] }), "utf8").toString("base64");
		const { fetch } = stubFetch([{ status: 200, body: { content } }]);
		const client = createGitHubClient({ token: "ghp_test", fetch });

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("load-error");
		expect((result as { message: string }).message).toBe("a plain string, not an Error");
	});
});
