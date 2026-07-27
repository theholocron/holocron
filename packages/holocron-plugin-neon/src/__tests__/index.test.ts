import { describe, expect, it } from "vitest";

import { AuthError, createPlugin,NeonStorage } from "../index.js";

describe("createPlugin", () => {
	it("throws AuthError when no token is found", () => {
		expect(() => createPlugin({ projectId: "p1", env: {} })).toThrow(AuthError);
	});

	it("throws when projectId is missing", () => {
		// @ts-expect-error — deliberately missing required field
		expect(() => createPlugin({ cliToken: "t" })).toThrow(/projectId/);
	});

	it("wires the storage capability", () => {
		const plugin = createPlugin({ projectId: "ancient-resonance-1", cliToken: "pat" });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-neon");
		expect(plugin.capabilities.storage()).toBeInstanceOf(NeonStorage);
	});

	it("passes fetch + baseUrl through to the REST client", async () => {
		let captured: string | null = null;
		const fakeFetch: typeof fetch = async (input) => {
			captured = typeof input === "string" ? input : input.toString();
			return new Response('{"branches":[]}', { status: 200 });
		};
		const plugin = createPlugin({
			projectId: "p1",
			cliToken: "pat",
			baseUrl: "https://test.invalid",
			fetch: fakeFetch,
		});
		await plugin.capabilities.storage().listBranches!();
		expect(captured).toBe("https://test.invalid/projects/p1/branches");
	});
});
