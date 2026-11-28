import type { ProbeRow } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { createPlugin } from "./index.js";

async function connection(options: Record<string, unknown>) {
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const plugin = createPlugin({ ...{}, ...options } as never);
	await plugin.probes.connection.run({
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	});
	return { rows, secrets };
}

describe("connection probe", () => {
	it("reaches the provider's host, finds the token, and asks the provider about it", async () => {
		const urls: string[] = [];
		const { rows, secrets } = await connection({
			cliToken: "tok-123",
			fetch: (async (input: string | URL) => {
				urls.push(String(input));
				return new Response("{}", { status: 401 });
			}) as typeof fetch,
		});
		expect(urls[0]).toBe("https://slack.com");
		expect(rows.find((r) => r.label.startsWith("reach"))).toMatchObject({ status: "ok" });
		expect(rows.find((r) => r.label === "token")).toMatchObject({ status: "ok" });
		expect(rows.at(-1)?.label).toBe("accepted");
		// The runner scrubs whatever is marked secret from what it prints.
		expect(secrets).toEqual(["tok-123"]);
	});

	it("says there is no token when none is configured", async () => {
		const { rows } = await connection({
			env: {},
			keyring: () => null,
			fetch: (async () => new Response("{}", { status: 200 })) as typeof fetch,
		});
		expect(rows.find((r) => r.label === "token")).toMatchObject({ status: "fail" });
	});
});
