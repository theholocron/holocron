/**
 * End-to-end wiring: createPlugin() should produce instantiable
 * implementations of every capability it declares.
 */

import { describe, expect, it } from "vitest";

import {
	AuthError,
	GitHubCi,
	GitHubEnvironments,
	GitHubIssues,
	GitHubSecrets,
	GitHubSource,
	createPlugin,
} from "../index.js";

const LABELS = { inProgress: "status:in-progress", inReview: "status:in-review" };

describe("createPlugin", () => {
	it("throws AuthError when no token is found", () => {
		expect(() => createPlugin({ repo: "theholocron/holocron", env: {} })).toThrow(AuthError);
	});

	it("wires every capability with the right concrete implementation", () => {
		const plugin = createPlugin({
			repo: "theholocron/holocron",
			cliToken: "pat-test",
			labels: LABELS,
		});

		expect(plugin.name).toBe("@theholocron/holocron-plugin-github");
		expect(plugin.capabilities.source()).toBeInstanceOf(GitHubSource);
		expect(plugin.capabilities.secrets()).toBeInstanceOf(GitHubSecrets);
		expect(plugin.capabilities.environments()).toBeInstanceOf(GitHubEnvironments);
		expect(plugin.capabilities.ci()).toBeInstanceOf(GitHubCi);
		expect(plugin.capabilities.issues()).toBeInstanceOf(GitHubIssues);
	});

	it("errors when issues is requested without `labels` in options", () => {
		const plugin = createPlugin({
			repo: "theholocron/holocron",
			cliToken: "pat-test",
		});
		expect(() => plugin.capabilities.issues()).toThrow(/labels/);
	});

	it("passes baseUrl + fetch through to the REST client", async () => {
		let captured: { url: string; method: string } | null = null;
		const fakeFetch: typeof fetch = async (input, init) => {
			captured = {
				url: typeof input === "string" ? input : input.toString(),
				method: (init?.method ?? "GET").toUpperCase(),
			};
			return new Response('{"login":"x"}', { status: 200 });
		};

		const plugin = createPlugin({
			repo: "theholocron/holocron",
			cliToken: "pat-test",
			baseUrl: "https://test.invalid",
			fetch: fakeFetch,
		});
		await plugin.capabilities.source().whoami();
		expect(captured).toEqual({ url: "https://test.invalid/user", method: "GET" });
	});
});
