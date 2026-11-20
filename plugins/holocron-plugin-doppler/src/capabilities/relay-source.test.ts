import { ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createDopplerClient } from "../rest.js";
import { DopplerVault } from "./vault.js";

const URL_ = "https://comlink.example.dev/doppler";
const input = { source: "doppler", url: URL_, name: "Doppler", scope: ["prd"], secret: "s3cret-value" };

function vaultOf(responses: Array<{ status?: number; body?: unknown }>) {
	const stub = stubFetch(responses);
	const client = createDopplerClient({ token: "t", fetch: stub.fetch });
	return { vault: new DopplerVault(() => client, { project: "demo", config: "dev" }), stub };
}

describe("DopplerVault.ensureRelaySource", () => {
	it("creates the webhook with the secret and configs, and returns the secret", async () => {
		const { vault, stub } = vaultOf([{ body: { webhooks: [] } }, { body: {} }]);
		const res = await vault.ensureRelaySource(input);
		expect(res).toEqual({ created: true, updated: [], secret: "s3cret-value" });
		expect(stub.calls[0]?.url).toContain("/webhooks?project=demo");
		expect(stub.calls[1]?.method).toBe("POST");
		expect(stub.calls[1]?.body).toMatchObject({
			url: URL_,
			name: "Doppler",
			secret: "s3cret-value",
			enableConfigs: ["prd"],
		});
	});

	it("adopts a webhook found by URL, makes no write and returns no secret", async () => {
		const { vault, stub } = vaultOf([{ body: { webhooks: [{ id: "w", url: URL_ }] } }]);
		expect(await vault.ensureRelaySource(input)).toEqual({ created: false, updated: [] });
		expect(stub.calls).toHaveLength(1);
	});

	it("uses options.project over the vault's", async () => {
		const { vault, stub } = vaultOf([{ body: { webhooks: [] } }, { body: {} }]);
		await vault.ensureRelaySource({ ...input, options: { project: "other" } });
		expect(stub.calls[1]?.url).toContain("project=other");
	});

	it("returns a todo, never the secret, when Doppler refuses the token on list or create", async () => {
		const listed = await vaultOf([{ status: 403, body: { messages: ["no"] } }]).vault.ensureRelaySource(input);
		expect(listed.created).toBe(false);
		expect(listed.todo?.[0]).toMatch(/personal token/);
		const made = await vaultOf([{ body: { webhooks: [] } }, { status: 401, body: {} }]).vault.ensureRelaySource(
			input
		);
		expect(made.todo).toHaveLength(1);
		expect(made.created).toBe(false);
		expect(JSON.stringify(made)).not.toContain("s3cret-value");
	});

	it("rethrows other failures", async () => {
		const err = await vaultOf([{ status: 500, body: {} }])
			.vault.ensureRelaySource(input)
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
	});
});

describe("DopplerVault.inspectRelaySource", () => {
	it("reports a missing webhook", async () => {
		expect(await vaultOf([{ body: { webhooks: [] } }]).vault.inspectRelaySource(input)).toEqual({ exists: false });
	});

	it("reports state without any secret value", async () => {
		const state = await vaultOf([
			{ body: { webhooks: [{ url: URL_, enabled: true, hasSecret: true, enabledConfigs: ["prd"] }] } },
		]).vault.inspectRelaySource(input);
		expect(state).toEqual({ exists: true, enabled: true, scope: ["prd"], hasSecret: true });
	});
});
