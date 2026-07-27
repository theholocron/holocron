import { describe, expect, it } from "vitest";

import { AuthError, createPlugin, VercelDeployment } from "../index.js";

describe("createPlugin", () => {
	it("throws AuthError when no token is found", () => {
		expect(() => createPlugin({ env: {} })).toThrow(AuthError);
	});

	it("wires the deployment capability", () => {
		const plugin = createPlugin({ cliToken: "pat-test" });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-vercel");
		expect(plugin.capabilities.deployment()).toBeInstanceOf(VercelDeployment);
	});

	it("passes teamId + fetch through to the REST client", async () => {
		let captured: string | null = null;
		const fakeFetch: typeof fetch = async (input) => {
			captured = typeof input === "string" ? input : input.toString();
			return new Response('{"projects":[]}', { status: 200 });
		};
		const plugin = createPlugin({
			cliToken: "pat-test",
			teamId: "team_xx",
			baseUrl: "https://test.invalid",
			fetch: fakeFetch,
		});
		await plugin.capabilities.deployment().listProjects();
		expect(captured).toBe("https://test.invalid/v10/projects?teamId=team_xx");
	});
});
