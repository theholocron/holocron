import { ProviderApiError } from "@theholocron/http-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createCodecovClient } from "./index.js";

const TOKEN = "codecov-test-token";

describe("createCodecovClient", () => {
	it("sends a Bearer authorization header", async () => {
		const { fetch, calls } = stubFetch([{ body: { name: "holocron" } }]);
		await createCodecovClient({ token: TOKEN, fetch }).repos.get("github", "theholocron", "holocron");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("gets a repository from the v2 base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: { name: "holocron", private: false } }]);
		const repo = await createCodecovClient({ token: TOKEN, fetch }).repos.get("github", "theholocron", "holocron");
		expect(repo.name).toBe("holocron");
		expect(calls[0]?.url).toBe("https://api.codecov.io/api/v2/github/theholocron/repos/holocron/");
	});

	it("gets an owner and encodes path segments", async () => {
		const { fetch, calls } = stubFetch([{ body: { username: "a b" } }]);
		await createCodecovClient({ token: TOKEN, fetch }).owners.get("gitlab", "a b");
		expect(calls[0]?.url).toBe("https://api.codecov.io/api/v2/gitlab/a%20b/");
	});

	it("respects the baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createCodecovClient({ token: TOKEN, baseUrl: "https://codecov.test.invalid/api/v2", fetch }).owners.get(
			"github",
			"o"
		);
		expect(calls[0]?.url).toBe("https://codecov.test.invalid/api/v2/github/o/");
	});

	it("rejects with a ProviderApiError carrying the status", async () => {
		const { fetch } = stubFetch([{ status: 401, body: { detail: "Invalid token." } }]);
		const err = await createCodecovClient({ token: TOKEN, fetch })
			.owners.get("github", "o")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
	});

	it("lists every flag, following the pages", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { next: "https://api.codecov.io/api/v2/x?page=2", results: [{ flag_name: "a" }] } },
			{ body: { next: null, results: [{ flag_name: "b" }] } },
		]);
		const found = await createCodecovClient({ token: TOKEN, fetch }).flags.list(
			"github",
			"theholocron",
			"holocron"
		);
		expect(found.map((f) => f.flag_name)).toEqual(["a", "b"]);
		expect(calls[0]?.url).toBe(
			"https://api.codecov.io/api/v2/github/theholocron/repos/holocron/flags/?page=1&page_size=100"
		);
		expect(calls[1]?.url).toContain("page=2");
	});

	it("lists no flags for an empty body", async () => {
		const { fetch } = stubFetch([{ body: {} }]);
		expect(await createCodecovClient({ token: TOKEN, fetch }).flags.list("github", "o", "r")).toEqual([]);
	});

	it("lists components from a plain array", async () => {
		const { fetch, calls } = stubFetch([{ body: [{ component_id: "a", name: "a" }] }]);
		const found = await createCodecovClient({ token: TOKEN, fetch }).components.list("github", "o", "r");
		expect(found.map((c) => c.component_id)).toEqual(["a"]);
		expect(calls[0]?.url).toBe("https://api.codecov.io/api/v2/github/o/repos/r/components/");
	});

	it("lists components from a paginated body", async () => {
		const { fetch } = stubFetch([{ body: { results: [{ component_id: "b", name: "b" }] } }, { body: {} }]);
		const client = createCodecovClient({ token: TOKEN, fetch });
		expect((await client.components.list("github", "o", "r")).map((c) => c.component_id)).toEqual(["b"]);
		expect(await client.components.list("github", "o", "r")).toEqual([]);
	});
});
