import { describe, expect, it } from "vitest";

import { checkProjectDomain } from "./app-domain-check.js";

const provider = (listDomains?: (id: string) => Promise<string[]>) => ({
	providerName: "vercel",
	...(listDomains ? { listDomains } : {}),
});

describe("checkProjectDomain", () => {
	it("passes when the project serves the domain", async () => {
		const result = await checkProjectDomain(
			provider(async () => ["a.example", "sentinel.example"]),
			"sentinel",
			"sentinel.example"
		);
		expect(result).toEqual({ status: "ok", message: "sentinel serves sentinel.example" });
	});

	it("fails naming what the project does serve", async () => {
		const result = await checkProjectDomain(
			provider(async () => ["other.example"]),
			"sentinel",
			"sentinel.example"
		);
		expect(result.status).toBe("fail");
		expect(result.message).toMatch(
			/does not serve sentinel\.example \(it serves other\.example\); nothing was written/
		);
	});

	it("says a project serves no domain", async () => {
		const result = await checkProjectDomain(
			provider(async () => []),
			"sentinel",
			"sentinel.example"
		);
		expect(result.message).toMatch(/it serves no domain/);
	});

	it("fails when the project's domains cannot be read", async () => {
		const result = await checkProjectDomain(
			provider(async () => {
				throw new Error("404 not found");
			}),
			"sentinel",
			"sentinel.example"
		);
		expect(result.status).toBe("fail");
		expect(result.message).toMatch(/cannot read the domains of vercel project "sentinel": 404 not found/);
	});

	it("skips when the app names no domain", async () => {
		expect(
			(
				await checkProjectDomain(
					provider(async () => []),
					"sentinel",
					undefined
				)
			).status
		).toBe("skipped");
	});

	it("skips when the provider cannot list domains", async () => {
		const result = await checkProjectDomain(provider(), "sentinel", "sentinel.example");
		expect(result.status).toBe("skipped");
		expect(result.message).toMatch(/cannot list a project's domains/);
	});
});
