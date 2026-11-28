import type { ProbeRow } from "@theholocron/cli";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlugin } from "./index.js";

async function run(options: Record<string, unknown>, args: string[]) {
	const rows: ProbeRow[] = [];
	const plugin = createPlugin({ repo: "acme/widgets", ...options } as never);
	await plugin.probes.token.run({
		args,
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: () => {},
		write: async () => undefined,
		cleanup: () => {},
	});
	return rows;
}

afterEach(() => vi.unstubAllGlobals());

describe("the github plugin's token probe", () => {
	it("is a token probe, read through the plugin's own options and fetch", async () => {
		const urls: string[] = [];
		const rows = await run(
			{
				cliToken: "tok-1",
				baseUrl: "https://ghe.test/api/",
				fetch: (async (input: string | URL) => {
					urls.push(String(input));
					return new Response("{}", { status: 200 });
				}) as typeof fetch,
			},
			[]
		);
		expect(urls[0]).toBe("https://ghe.test/api/user");
		expect(rows[0]).toMatchObject({ status: "ok", label: "token" });
	});

	it("uses the global fetch and api.github.com when the options give none", async () => {
		const urls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL) => {
			urls.push(String(input));
			return new Response("{}", { status: 401 });
		});
		const rows = await run({ cliToken: "tok-1" }, ["--token-name", "HOLOCRON_ADMIN_TOKEN"]);
		expect(urls).toEqual(["https://api.github.com/user"]);
		expect(rows[0]).toMatchObject({ status: "fail" });
	});

	it("reports a missing feature token as a failure naming the variable (the runner turns a throw into a row)", async () => {
		const err = await run({ env: {}, keyring: () => null }, ["--token-name", "HOLOCRON_ADMIN_TOKEN"]).catch(
			(e: unknown) => e
		);
		expect(String(err)).toMatch(/HOLOCRON_ADMIN_TOKEN/);
	});
});
