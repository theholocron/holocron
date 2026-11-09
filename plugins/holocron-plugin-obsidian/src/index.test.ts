import { describe, expect, it } from "vitest";

import { createPlugin, ideas } from "./index.js";

describe("createPlugin", () => {
	it("returns a plugin with an ideas capability factory and no probes", () => {
		const plugin = createPlugin();
		expect(plugin.name).toBe("@theholocron/holocron-plugin-obsidian");
		expect(typeof plugin.capabilities.ideas).toBe("function");
		expect(plugin).not.toHaveProperty("probes");
	});

	it("builds an ideas capability with the right key and provider name", () => {
		const cap = createPlugin({ dir: "/vault" }).capabilities.ideas();
		expect(cap.key).toBe("ideas");
		expect(cap.providerName).toBe("obsidian");
	});

	it("uses an injected disk instead of the real one", async () => {
		const reads: string[] = [];
		const cap = ideas({
			dir: "/vault",
			env: {},
			io: {
				readDir: (path) => (reads.push(path), []),
				read: () => undefined,
				write: () => undefined,
				home: () => "/h",
			},
		});
		expect(await cap.list()).toEqual([]);
		expect(reads).toEqual(["/vault"]);
	});
});
