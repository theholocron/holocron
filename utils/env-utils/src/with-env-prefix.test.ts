import { describe, expect, it } from "vitest";

import { createEnvLookup } from "./create-env-lookup.js";
import { withEnvPrefix } from "./with-env-prefix.js";

describe("withEnvPrefix", () => {
	it("prefers the prefixed variable", () => {
		const env = withEnvPrefix(createEnvLookup({ APP_TOKEN: "prefixed", TOKEN: "bare" }), "APP");
		expect(env.get("TOKEN")).toBe("prefixed");
	});

	it("falls back to the bare variable", () => {
		const env = withEnvPrefix(createEnvLookup({ TOKEN: "bare" }), "APP");
		expect(env.get("TOKEN")).toBe("bare");
	});

	it("skips an empty prefixed value", () => {
		const env = withEnvPrefix(createEnvLookup({ APP_TOKEN: "", TOKEN: "bare" }), "APP");
		expect(env.get("TOKEN")).toBe("bare");
	});

	it("returns undefined when neither is set", () => {
		const env = withEnvPrefix(createEnvLookup({}), "APP");
		expect(env.get("TOKEN")).toBeUndefined();
	});

	it("wraps any EnvLookup, such as a hand-written fake", () => {
		const fake = { get: (key: string) => (key === "APP_TOKEN" ? "from-fake" : undefined) };
		expect(withEnvPrefix(fake, "APP").get("TOKEN")).toBe("from-fake");
	});

	it("composes with firstEnv-style chains because the result is an EnvLookup", () => {
		const env = withEnvPrefix(createEnvLookup({ HOLOCRON_ORG: "acme" }), "HOLOCRON");
		expect(env.get("ORG")).toBe("acme");
	});

	it("matches the prefix with exact case", () => {
		const env = withEnvPrefix(createEnvLookup({ HOLOCRON_TOKEN: "prefixed", TOKEN: "bare" }), "holocron");
		expect(env.get("TOKEN")).toBe("bare");
	});
});
