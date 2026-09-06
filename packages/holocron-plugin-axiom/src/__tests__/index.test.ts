import { describe, expect, it } from "vitest";

import { createPlugin } from "../index.js";

describe("createPlugin", () => {
	it("returns a plugin with a logs capability factory", () => {
		const plugin = createPlugin({ cliToken: "xaat-tok", env: {} });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-axiom");
		expect(typeof plugin.capabilities.logs).toBe("function");
	});

	it("capability has the correct key and providerName", () => {
		const plugin = createPlugin({ cliToken: "xaat-tok", env: {} });
		const cap = plugin.capabilities.logs();
		expect(cap.key).toBe("logs");
		expect(cap.providerName).toBe("axiom");
	});

	it("resolves the dataset from HOLOCRON_AXIOM_DATASET", async () => {
		const plugin = createPlugin({
			cliToken: "xaat-tok",
			env: { HOLOCRON_AXIOM_DATASET: "holocron-ci" },
			fetch: (async () =>
				new Response(JSON.stringify({ id: "d1", name: "holocron-ci" }), { status: 200 })) as typeof fetch,
		});
		const cap = plugin.capabilities.logs();
		await expect(cap.whoami!()).resolves.toEqual({ ok: true, dataset: "holocron-ci" });
	});

	it("prefers an explicit dataset option over the env var", async () => {
		let requestedUrl = "";
		const plugin = createPlugin({
			cliToken: "xaat-tok",
			dataset: "explicit-ds",
			env: { HOLOCRON_AXIOM_DATASET: "env-ds", AXIOM_DATASET: "vendor-ds" },
			fetch: (async (input: string | URL) => {
				requestedUrl = String(input);
				return new Response(JSON.stringify({ id: "d1", name: "explicit-ds" }), { status: 200 });
			}) as typeof fetch,
		});
		await plugin.capabilities.logs().whoami!();
		expect(requestedUrl).toContain("/v2/datasets/explicit-ds");
	});
});
