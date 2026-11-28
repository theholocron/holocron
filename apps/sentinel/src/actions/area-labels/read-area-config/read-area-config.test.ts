import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import {
	validateConfig as realValidateConfig,
	type ValidateConfigResult,
} from "../../../utils/validate-config/index.js";
import { readAreaConfig } from "./read-area-config.js";

vi.mock("../../../utils/validate-config/index.js", () => ({ validateConfig: vi.fn() }));

const client = {} as GitHubClient;
const valid = (config: unknown): ValidateConfigResult =>
	({ status: "valid", filepath: "holocron.config.ts", config }) as ValidateConfigResult;
const read = (result: ValidateConfigResult) =>
	readAreaConfig({ client, repo: "acme/demo", validateConfig: vi.fn(async () => result) });

describe("readAreaConfig", () => {
	it("returns the declared areas and scopes of the repository's own config", async () => {
		const validateConfig = vi.fn(async () =>
			valid({ repo: { labels: { areas: { cli: ["cli/**"] }, scopes: { sentinel: "sentinel" } } } })
		);
		expect(await readAreaConfig({ client, repo: "acme/demo", validateConfig })).toEqual({
			ok: true,
			areas: { cli: ["cli/**"] },
			scopes: { sentinel: "sentinel" },
		});
		expect(validateConfig).toHaveBeenCalledWith({ client, repo: "acme/demo" });
	});

	it("reads the config through Sentinel's own reader when none is injected", async () => {
		vi.mocked(realValidateConfig).mockResolvedValue(valid({ repo: { labels: { areas: { cli: ["cli/**"] } } } }));
		expect(await readAreaConfig({ client, repo: "acme/demo" })).toMatchObject({ ok: true });
		expect(realValidateConfig).toHaveBeenCalledWith({ client, repo: "acme/demo" });
	});

	it("allows areas with no scopes", async () => {
		expect(await read(valid({ repo: { labels: { areas: { cli: ["cli/**"] } } } }))).toEqual({
			ok: true,
			areas: { cli: ["cli/**"] },
			scopes: undefined,
		});
	});

	it("is a reason, not an error, for a repo with no config", async () => {
		expect(await read({ status: "no-config" })).toEqual({
			ok: false,
			reason: "acme/demo has no usable holocron config (no-config)",
		});
	});

	it("is a reason for a repo that declares no areas", async () => {
		const none = { ok: false, reason: "acme/demo declares no repo.labels.areas" };
		expect(await read(valid({}))).toEqual(none);
		expect(await read(valid({ repo: {} }))).toEqual(none);
		expect(await read(valid({ repo: { labels: { scopes: { a: "b" } } } }))).toEqual(none);
		expect(await read(valid({ repo: { labels: { areas: {} } } }))).toEqual(none);
	});
});
