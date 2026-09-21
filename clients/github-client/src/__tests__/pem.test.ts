/* eslint-disable n/no-unsupported-features/node-builtins -- this dir only ever runs under
 * vitest/Node, never Workers, so eslint-plugin-n's node-builtins compat-table warning
 * (crypto.subtle flagged experimental on this repo's engines floor) doesn't apply here.
 * Source-level, not config-level, because astromech's --config resolver currently
 * overrides this package's local eslint.config.ts entirely (theholocron/holocron#749) —
 * drop this once that's fixed and the local exception is honored again. */
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { base64UrlEncode, importRsaPrivateKey } from "../app-auth/pem.js";

function generateKey(type: "pkcs1" | "pkcs8"): string {
	return generateKeyPairSync("rsa", {
		modulusLength: 2048,
		privateKeyEncoding: { type, format: "pem" },
	}).privateKey;
}

describe("importRsaPrivateKey", () => {
	it.each(["pkcs1", "pkcs8"] as const)(
		"imports a %s-encoded key and produces a signature verifiable against its public half",
		async (format) => {
			const pem = generateKey(format);
			const key = await importRsaPrivateKey(pem);

			const message = new TextEncoder().encode("test-message");
			const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, message);

			const publicKey = createPublicKey(pem);
			const isValid = verify("sha256", message, publicKey, new Uint8Array(signature));
			expect(isValid).toBe(true);
		}
	);

	it("imports as a non-extractable, sign-only key", async () => {
		const key = await importRsaPrivateKey(generateKey("pkcs8"));
		expect(key.extractable).toBe(false);
		expect(key.usages).toEqual(["sign"]);
	});
});

describe("base64UrlEncode", () => {
	it("encodes without padding or URL-unsafe characters", () => {
		// A byte sequence chosen to produce +, /, and = in standard base64.
		const bytes = new Uint8Array([0xfb, 0xff, 0xfe]);
		const encoded = base64UrlEncode(bytes);
		expect(encoded).not.toMatch(/[+/=]/);
		expect(Buffer.from(bytes).toString("base64")).toContain("+"); // sanity: standard base64 does contain it
	});

	it("round-trips through Buffer's base64url decoding", () => {
		const bytes = new TextEncoder().encode("hello world");
		const encoded = base64UrlEncode(bytes);
		expect(Buffer.from(encoded, "base64url").toString()).toBe("hello world");
	});
});
