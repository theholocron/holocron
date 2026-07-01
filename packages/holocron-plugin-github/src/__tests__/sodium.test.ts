import { describe, expect, it } from "vitest";

import { encryptSecret, sodium } from "../sodium.js";

describe("encryptSecret", () => {
	it("produces ciphertext decryptable by the matching secret key", async () => {
		await sodium.ready;
		// Generate a keypair we control, so we can decrypt and verify.
		const { publicKey, privateKey } = sodium.crypto_box_keypair();
		const publicKeyBase64 = sodium.to_base64(publicKey, sodium.base64_variants.ORIGINAL);

		const plaintext = "hunter2-very-secret";
		const ciphertextBase64 = await encryptSecret(publicKeyBase64, plaintext);

		const ciphertext = sodium.from_base64(ciphertextBase64, sodium.base64_variants.ORIGINAL);
		const decrypted = sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey);
		expect(sodium.to_string(decrypted)).toBe(plaintext);
	});

	it("produces different ciphertexts for the same plaintext (sealed box is non-deterministic)", async () => {
		await sodium.ready;
		const { publicKey } = sodium.crypto_box_keypair();
		const publicKeyBase64 = sodium.to_base64(publicKey, sodium.base64_variants.ORIGINAL);

		const a = await encryptSecret(publicKeyBase64, "same value");
		const b = await encryptSecret(publicKeyBase64, "same value");
		expect(a).not.toEqual(b);
	});

	it("handles unicode values correctly through base64 round-trip", async () => {
		await sodium.ready;
		const { publicKey, privateKey } = sodium.crypto_box_keypair();
		const publicKeyBase64 = sodium.to_base64(publicKey, sodium.base64_variants.ORIGINAL);

		const plaintext = "한글 emoji 🎉 mixed";
		const ciphertextBase64 = await encryptSecret(publicKeyBase64, plaintext);
		const ciphertext = sodium.from_base64(ciphertextBase64, sodium.base64_variants.ORIGINAL);
		const decrypted = sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey);
		expect(sodium.to_string(decrypted)).toBe(plaintext);
	});
});
