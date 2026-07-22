import { describe, expect, it } from "vitest";

import { GitHubSecrets } from "../capabilities/secrets.js";
import { createGitHubClient } from "../rest.js";
import { sodium } from "../sodium.js";

import { stubFetch } from "./helpers.js";

const REPO = "theholocron/holocron";

async function makeKeypair() {
	await sodium.ready;
	const { publicKey, privateKey } = sodium.crypto_box_keypair();
	return {
		publicKey,
		privateKey,
		publicKeyBase64: sodium.to_base64(publicKey, sodium.base64_variants.ORIGINAL),
	};
}

function makeSecrets(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	const secrets = new GitHubSecrets(rest, { repo: REPO });
	return { secrets, calls };
}

describe("GitHubSecrets — repo scope", () => {
	it("listSecrets → GET /actions/secrets and returns names", async () => {
		const { secrets, calls } = makeSecrets([
			{ status: 200, body: { total_count: 2, secrets: [{ name: "A" }, { name: "B" }] } },
		]);
		expect(await secrets.listSecrets({ kind: "repo" })).toEqual(["A", "B"]);
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/actions/secrets`);
	});

	it("setSecret fetches public key, encrypts, then PUTs the encrypted value", async () => {
		const { publicKey, privateKey, publicKeyBase64 } = await makeKeypair();
		const { secrets, calls } = makeSecrets([
			{ status: 200, body: { key_id: "keyid-1", key: publicKeyBase64 } },
			{ status: 204 },
		]);

		await secrets.setSecret({ kind: "repo" }, "CLERK_WEBHOOK_SECRET", "plaintext-value");

		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`);
		expect(calls[1]?.method).toBe("PUT");
		expect(calls[1]?.url).toBe(`https://api.github.com/repos/${REPO}/actions/secrets/CLERK_WEBHOOK_SECRET`);
		const putBody = calls[1]?.body as { encrypted_value: string; key_id: string };
		expect(putBody.key_id).toBe("keyid-1");

		// Verify the encrypted payload decrypts back to the plaintext.
		const ciphertext = sodium.from_base64(putBody.encrypted_value, sodium.base64_variants.ORIGINAL);
		const decrypted = sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey);
		expect(sodium.to_string(decrypted)).toBe("plaintext-value");
	});

	it("deleteSecret → DELETE /actions/secrets/{name}", async () => {
		const { secrets, calls } = makeSecrets([{ status: 204 }]);
		await secrets.deleteSecret({ kind: "repo" }, "GONE");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/actions/secrets/GONE`);
	});
});

describe("GitHubSecrets — environment scope", () => {
	it("listSecrets → environments/{env}/secrets", async () => {
		const { secrets, calls } = makeSecrets([
			{ status: 200, body: { total_count: 1, secrets: [{ name: "PROD_X" }] } },
		]);
		expect(await secrets.listSecrets({ kind: "environment", name: "production" })).toEqual(["PROD_X"]);
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/environments/production/secrets`);
	});

	it("setSecret hits the environment-scoped public key + secret PUT", async () => {
		const { publicKeyBase64 } = await makeKeypair();
		const { secrets, calls } = makeSecrets([
			{ status: 200, body: { key_id: "env-keyid", key: publicKeyBase64 } },
			{ status: 204 },
		]);
		await secrets.setSecret({ kind: "environment", name: "staging" }, "KEY", "val");

		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/environments/staging/secrets/public-key`);
		expect(calls[1]?.url).toBe(`https://api.github.com/repos/${REPO}/environments/staging/secrets/KEY`);
	});

	it("deleteSecret → DELETE environments/{env}/secrets/{name}", async () => {
		const { secrets, calls } = makeSecrets([{ status: 204 }]);
		await secrets.deleteSecret({ kind: "environment", name: "staging" }, "KEY");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/environments/staging/secrets/KEY`);
	});
});

describe("GitHubSecrets — organization scope", () => {
	it("listSecrets → /orgs/{org}/actions/secrets", async () => {
		const { secrets, calls } = makeSecrets([{ status: 200, body: { total_count: 0, secrets: [] } }]);
		await secrets.listSecrets({ kind: "organization", name: "theholocron" });
		expect(calls[0]?.url).toBe("https://api.github.com/orgs/theholocron/actions/secrets");
	});

	it("setSecret sends visibility=all on org-scoped writes", async () => {
		const { publicKeyBase64 } = await makeKeypair();
		const { secrets, calls } = makeSecrets([
			{ status: 200, body: { key_id: "org-keyid", key: publicKeyBase64 } },
			{ status: 204 },
		]);
		await secrets.setSecret({ kind: "organization", name: "theholocron" }, "SHARED", "val");
		const body = calls[1]?.body as Record<string, unknown>;
		expect(body.visibility).toBe("all");
		expect(body.key_id).toBe("org-keyid");
	});
});
