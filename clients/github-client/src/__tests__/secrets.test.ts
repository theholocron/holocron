import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

describe("secrets", () => {
	it("lists repo secrets", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { total_count: 1, secrets: [{ name: "NPM_TOKEN" }] } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.secrets.listSecrets(REPO, { kind: "repo" });
		expect(calls[0]?.url).toContain("/actions/secrets");
		expect(result).toEqual(["NPM_TOKEN"]);
	});

	it("lists environment secrets", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { total_count: 1, secrets: [{ name: "DB_URL" }] } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.secrets.listSecrets(REPO, {
			kind: "environment",
			name: "staging",
		});
		expect(calls[0]?.url).toContain("/environments/staging/secrets");
	});

	it("lists org secrets", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { total_count: 1, secrets: [{ name: "ORG_SECRET" }] } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.secrets.listSecrets(REPO, {
			kind: "organization",
			org: "theholocron",
		});
		expect(calls[0]?.url).toContain("/orgs/theholocron/actions/secrets");
	});

	it("GET public key", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { key_id: "1", key: "abc" } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.secrets.getPublicKey(REPO, {
			kind: "repo",
		});
		expect(calls[0]?.url).toContain("/secrets/public-key");
		expect(result.key_id).toBe("1");
	});

	it("PUT secret", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.secrets.putSecret(REPO, { kind: "repo" }, "MY_SECRET", {
			encrypted_value: "enc",
			key_id: "1",
		});
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/secrets/MY_SECRET");
	});

	it("DELETE secret", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.secrets.deleteSecret(REPO, { kind: "repo" }, "OLD_SECRET");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/secrets/OLD_SECRET");
	});
});
