import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	CONFIG_BRANCH_TTL_MS,
	CONFIG_CACHE_MAX_ENTRIES,
	CONFIG_COMMIT_TTL_MS,
	resetValidateConfigCache,
	validateConfig,
} from "./validate-config.js";

const SHA = "a".repeat(40);

/** A client whose repository has no config: each read is a few counted 404s and ends `no-config`. */
function emptyRepo() {
	const getContents = vi.fn(async () => {
		throw new ProviderApiError("not found", 404, "");
	});
	return { client: { git: { getContents } } as unknown as GitHubClient, getContents };
}

beforeEach(() => {
	resetValidateConfigCache();
});

describe("validateConfig's shared read", () => {
	it("reads once for concurrent callers, and answers them all", async () => {
		const { client, getContents } = emptyRepo();
		const results = await Promise.all([
			validateConfig({ client, repo: "a/b", now: 1_000 }),
			validateConfig({ client, repo: "a/b", now: 1_000 }),
			validateConfig({ client, repo: "a/b", now: 1_000 }),
		]);
		expect(results).toEqual([{ status: "no-config" }, { status: "no-config" }, { status: "no-config" }]);
		const callsForOneRead = getContents.mock.calls.length;
		expect(callsForOneRead).toBeGreaterThan(0);
		await validateConfig({ client, repo: "a/b", now: 1_000 });
		expect(getContents.mock.calls.length).toBe(callsForOneRead);
	});

	it("reuses a read for a branch for a minute, then reads again", async () => {
		const { client, getContents } = emptyRepo();
		await validateConfig({ client, repo: "a/b", ref: "feat/x", now: 1_000 });
		const one = getContents.mock.calls.length;
		await validateConfig({ client, repo: "a/b", ref: "feat/x", now: 1_000 + CONFIG_BRANCH_TTL_MS - 1 });
		expect(getContents.mock.calls.length).toBe(one);
		await validateConfig({ client, repo: "a/b", ref: "feat/x", now: 1_000 + CONFIG_BRANCH_TTL_MS });
		expect(getContents.mock.calls.length).toBe(one * 2);
	});

	it("keeps a read at a commit longer, because a commit never changes", async () => {
		const { client, getContents } = emptyRepo();
		await validateConfig({ client, repo: "a/b", ref: SHA, now: 1_000 });
		const one = getContents.mock.calls.length;
		await validateConfig({ client, repo: "a/b", ref: SHA, now: 1_000 + CONFIG_COMMIT_TTL_MS - 1 });
		expect(getContents.mock.calls.length).toBe(one);
		await validateConfig({ client, repo: "a/b", ref: SHA, now: 1_000 + CONFIG_COMMIT_TTL_MS });
		expect(getContents.mock.calls.length).toBe(one * 2);
	});

	it("keeps the repositories and refs apart", async () => {
		const { client, getContents } = emptyRepo();
		await validateConfig({ client, repo: "a/b", now: 1_000 });
		const one = getContents.mock.calls.length;
		await validateConfig({ client, repo: "a/c", now: 1_000 });
		await validateConfig({ client, repo: "a/b", ref: "alpha", now: 1_000 });
		expect(getContents.mock.calls.length).toBe(one * 3);
	});

	it("reads again when asked to, for a caller that writes from the result", async () => {
		const { client, getContents } = emptyRepo();
		await validateConfig({ client, repo: "a/b", now: 1_000 });
		const one = getContents.mock.calls.length;
		await validateConfig({ client, repo: "a/b", now: 1_000, fresh: true });
		expect(getContents.mock.calls.length).toBe(one * 2);
	});

	it("never keeps a GitHub failure", async () => {
		const failing = vi.fn(async () => {
			throw new ProviderApiError("server error", 500, "");
		});
		const client = { git: { getContents: failing } } as unknown as GitHubClient;
		await expect(validateConfig({ client, repo: "a/b", now: 1_000 })).rejects.toThrow("server error");
		const afterFirst = failing.mock.calls.length;
		await expect(validateConfig({ client, repo: "a/b", now: 1_000 })).rejects.toThrow("server error");
		expect(failing.mock.calls.length).toBeGreaterThan(afterFirst);
	});

	it("keeps a newer read when an older one for the same key fails late", async () => {
		let failFirst: (err: Error) => void = () => undefined;
		const slow = vi.fn(
			() =>
				new Promise<never>((_resolve, reject) => {
					failFirst = reject;
				})
		);
		const first = validateConfig({
			client: { git: { getContents: slow } } as unknown as GitHubClient,
			repo: "a/b",
			now: 1_000,
		});
		first.catch(() => undefined);
		resetValidateConfigCache();
		const { client, getContents } = emptyRepo();
		await validateConfig({ client, repo: "a/b", now: 1_000 });
		const one = getContents.mock.calls.length;
		failFirst(new ProviderApiError("late failure", 500, ""));
		await expect(first).rejects.toThrow("late failure");
		await validateConfig({ client, repo: "a/b", now: 1_000 });
		expect(getContents.mock.calls.length).toBe(one);
	});

	it("drops the oldest reads once it holds too many", async () => {
		const { client, getContents } = emptyRepo();
		await validateConfig({ client, repo: "first/repo", now: 1_000 });
		const one = getContents.mock.calls.length;
		for (let i = 0; i < CONFIG_CACHE_MAX_ENTRIES; i += 1) {
			await validateConfig({ client, repo: `other/repo-${i}`, now: 1_000 });
		}
		const before = getContents.mock.calls.length;
		await validateConfig({ client, repo: "first/repo", now: 1_000 });
		expect(getContents.mock.calls.length).toBe(before + one);
	});

	it("drops reads older than the longest time it keeps any", async () => {
		const { client, getContents } = emptyRepo();
		await validateConfig({ client, repo: "a/b", ref: SHA, now: 1_000 });
		const one = getContents.mock.calls.length;
		await validateConfig({ client, repo: "a/other", now: 1_000 + CONFIG_COMMIT_TTL_MS });
		await validateConfig({ client, repo: "a/b", ref: SHA, now: 1_000 + CONFIG_COMMIT_TTL_MS });
		expect(getContents.mock.calls.length).toBe(one * 3);
	});

	it("uses the real clock by default", async () => {
		const { client, getContents } = emptyRepo();
		await validateConfig({ client, repo: "a/default-clock" });
		const one = getContents.mock.calls.length;
		await validateConfig({ client, repo: "a/default-clock" });
		expect(getContents.mock.calls.length).toBe(one);
	});
});
