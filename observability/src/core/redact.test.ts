import { describe, expect, it } from "vitest";

import { redact, REDACT_CENSOR, REDACTED_PATHS, redactObject, redactOptions } from "./redact.js";

describe("token-shape scrubbing", () => {
	it("redacts prefix-style tokens (ghp_, xoxb-, npm_, sk-, …)", () => {
		expect(redact("auth failed with ghp_abc123XYZ")).toBe("auth failed with [REDACTED]");
		expect(redact("slack xoxb-111-222-zzz done")).toBe("slack [REDACTED] done");
	});

	it("redacts SCREAMING_SNAKE_TOKEN= patterns", () => {
		expect(redact("GITHUB_TOKEN=ghs_secret456 next")).not.toContain("ghs_secret456");
	});

	it("leaves non-token content intact", () => {
		expect(redact("config not found at ./holocron.config.ts")).toBe("config not found at ./holocron.config.ts");
	});

	it("redactObject deep-scrubs every string in an object", () => {
		const out = redactObject({ a: { b: "ghp_leaked" }, c: ["x", "npm_leaked"] }); // gitleaks:allow — fixture
		expect(JSON.stringify(out)).not.toContain("ghp_leaked");
		expect(JSON.stringify(out)).not.toContain("npm_leaked");
		expect(out.c[0]).toBe("x");
	});
});

describe("Pino field-path redaction", () => {
	it("exposes the known-sensitive paths and the censor string", () => {
		expect(REDACTED_PATHS).toContain("token");
		expect(REDACTED_PATHS).toContain("headers.authorization");
		expect(REDACT_CENSOR).toBe("[Redacted]");
	});

	it("redactOptions is a ready-to-use Pino `redact` option", () => {
		expect(redactOptions.censor).toBe("[Redacted]");
		expect(redactOptions.paths).toEqual([...REDACTED_PATHS]);
	});
});
