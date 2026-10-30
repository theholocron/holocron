import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { syncProperties } from "./properties.js";

const REPO = "theholocron/holocron";

function makeRest(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	return { rest, calls };
}

describe("syncProperties", () => {
	it("PATCHes /repos/{owner}/{name}/properties/values with mapped entries", async () => {
		const { rest, calls } = makeRest([{ status: 204, body: null }]);

		const result = await syncProperties(rest, REPO, {
			holocron_branch_protection_level: "strict",
			lifecycle: "active",
			monorepo: "false",
		});

		expect(result).toBe("3 properties set");
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			method: "PATCH",
			url: expect.stringContaining("/repos/theholocron/holocron/properties/values"),
			body: {
				properties: expect.arrayContaining([
					{ property_name: "holocron_branch_protection_level", value: "strict" },
					{ property_name: "lifecycle", value: "active" },
					{ property_name: "monorepo", value: "false" },
				]),
			},
		});
	});

	it("passes a string array through untouched for multi_select properties", async () => {
		const { rest, calls } = makeRest([{ status: 204, body: null }]);

		const result = await syncProperties(rest, REPO, {
			holocron_capabilities: ["ci", "source"],
		});

		expect(result).toBe("1 properties set");
		expect(calls[0]?.body).toMatchObject({
			properties: [{ property_name: "holocron_capabilities", value: ["ci", "source"] }],
		});
	});

	it("returns '0 properties set' for an empty values map", async () => {
		const { rest, calls } = makeRest([{ status: 204, body: null }]);

		const result = await syncProperties(rest, REPO, {});

		expect(result).toBe("0 properties set");
		expect(calls[0]?.body).toMatchObject({ properties: [] });
	});

	it("uses owner/name from the repo coordinate", async () => {
		const { rest, calls } = makeRest([{ status: 204, body: null }]);

		await syncProperties(rest, "acme/my-lib", { open_source: "true" });

		expect(calls[0]?.url).toContain("/repos/acme/my-lib/properties/values");
	});

	describe("when GitHub answers 422", () => {
		const SCHEMA = [
			{
				property_name: "holocron_capabilities",
				value_type: "multi_select",
				allowed_values: ["ci", "source"],
			},
		];
		const capture = (fn: () => Promise<unknown>) => fn().catch((e: unknown) => e);

		it("names the value the organization's property does not allow, and quotes GitHub", async () => {
			const { rest, calls } = makeRest([
				{ status: 422, text: JSON.stringify({ message: "Validation Failed" }) },
				{ status: 200, body: SCHEMA },
			]);

			const err = await capture(() =>
				syncProperties(rest, REPO, { holocron_capabilities: ["ci", "monitoring"] })
			);

			expect(err).toBeInstanceOf(Error);
			const message = (err as Error).message;
			expect(message).toContain("none was set");
			expect(message).toContain('holocron_capabilities has "monitoring", which is not one of its allowed values');
			expect(message).toContain("GitHub said: Validation Failed");
			expect((err as Error).cause).toBeInstanceOf(ProviderApiError);
			expect(calls[1]).toMatchObject({
				method: "GET",
				url: expect.stringContaining("/orgs/theholocron/properties/schema"),
			});
		});

		it("adds the errors GitHub lists to its message", async () => {
			const { rest } = makeRest([
				{ status: 422, text: JSON.stringify({ message: "Validation Failed", errors: [{ field: "value" }] }) },
				{ status: 200, body: SCHEMA },
			]);

			const err = await capture(() => syncProperties(rest, REPO, { holocron_capabilities: ["ci"] }));

			expect((err as Error).message).toContain('GitHub said: Validation Failed: {"field":"value"}');
			expect((err as Error).message).toContain("no value differs");
		});

		it("falls back to the start of a body that is not JSON, and says the definitions could not be read", async () => {
			const { rest } = makeRest([
				{ status: 422, text: "x".repeat(400) },
				{ status: 403, body: { message: "Resource not accessible" } },
			]);

			const err = await capture(() => syncProperties(rest, REPO, { monorepo: "true" }));

			const message = (err as Error).message;
			expect(message).toContain("could not be read");
			expect(message).toContain(`GitHub said: ${"x".repeat(300)}`);
			expect(message).not.toContain("x".repeat(301));
		});

		it("uses the whole body when its message is not text", async () => {
			const { rest } = makeRest([
				{ status: 422, text: JSON.stringify({ message: 42 }) },
				{ status: 200, body: SCHEMA },
			]);

			const err = await capture(() => syncProperties(rest, REPO, { holocron_capabilities: ["ci"] }));

			expect((err as Error).message).toContain('GitHub said: {"message":42}');
		});

		it("still explains itself with a client that cannot read the definitions, and with no body", async () => {
			const client = {
				properties: {
					setProperties: async () => {
						throw new ProviderApiError("GitHub PATCH → 422", 422);
					},
				},
			} as unknown as GitHubClient;

			const err = await capture(() => syncProperties(client, REPO, { monorepo: "true" }));

			expect((err as Error).message).toContain("could not be read");
			expect((err as Error).message).toMatch(/GitHub said: $/);
		});
	});

	it("passes an error that is not a 422 through untouched, without reading the definitions", async () => {
		const { rest, calls } = makeRest([{ status: 403, body: { message: "Forbidden" } }]);

		const err = await syncProperties(rest, REPO, { monorepo: "true" }).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(403);
		expect(calls).toHaveLength(1);
	});

	it("passes an error that is not from the API through untouched", async () => {
		const boom = new TypeError("not a response");
		const client = {
			properties: {
				setProperties: async () => {
					throw boom;
				},
			},
		} as unknown as GitHubClient;

		const err = await syncProperties(client, REPO, { monorepo: "true" }).catch((e: unknown) => e);

		expect(err).toBe(boom);
	});
});
