import { describe, expect, it } from "vitest";

import { generatedSecret, generateSecretValue } from "./generated-secrets.js";

const fixed = (size: number) => new Uint8Array(size).fill(0xab);

describe("generatedSecret", () => {
	it("knows CRON_SECRET and nothing else", () => {
		expect(generatedSecret("CRON_SECRET")).toMatchObject({ bytes: 32, encoding: "hex" });
		expect(generatedSecret("HOLOCRON_CLOUDFLARE_TOKEN")).toBeUndefined();
	});

	it("does not take a name off the object's prototype", () => {
		expect(generatedSecret("toString")).toBeUndefined();
		expect(generatedSecret("__proto__")).toBeUndefined();
	});
});

describe("generateSecretValue", () => {
	it("writes the declared number of bytes in the declared encoding", () => {
		expect(generateSecretValue("CRON_SECRET", fixed)).toBe("ab".repeat(32));
	});

	it("is random with the real source: 64 hex characters, different each time", () => {
		const a = generateSecretValue("CRON_SECRET");
		const b = generateSecretValue("CRON_SECRET");
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(a).not.toBe(b);
	});

	it("refuses a name it does not generate, naming the ones it does and never a value", () => {
		const err = (() => {
			try {
				generateSecretValue("HOLOCRON_CLOUDFLARE_TOKEN", fixed);
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(
			/HOLOCRON_CLOUDFLARE_TOKEN is not a secret the CLI generates \(CRON_SECRET\)/
		);
	});
});
