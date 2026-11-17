import { describe, expect, it, vi } from "vitest";

// loadConfigFromContent only ever throws real Error instances in practice (it wraps every failure in ConfigFileError);
// this covers the defensive `String(err)` fallback for a hypothetical non-Error throw, in its own file so the mock does
// not touch load-layered-from-content.test.ts's real loader.
vi.mock("../load-config-from-content/index.js", () => ({
	loadConfigFromContent: vi.fn().mockRejectedValue("a plain string, not an Error"),
}));

describe("loadLayeredFromContent — non-Error throw from loadConfigFromContent", () => {
	it("names the file and keeps the thrown value as the message", async () => {
		const { ConfigFileError } = await import("../errors/index.js");
		const { loadLayeredFromContent } = await import("./load-layered-from-content.js");

		const err = await loadLayeredFromContent({
			dir: "/unused",
			name: "astromech",
			fetch: async (path) => (path === "astromech.config.ts" ? "export default {}" : undefined),
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as InstanceType<typeof ConfigFileError>).filepath).toBe("astromech.config.ts");
		expect((err as Error).message).toBe("a plain string, not an Error");
	});
});
