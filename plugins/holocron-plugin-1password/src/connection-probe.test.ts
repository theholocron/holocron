import type { ProbeRow } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { stubSpawn } from "./helpers.js";
import { createPlugin } from "./index.js";

async function connection(whoami: Parameters<typeof stubSpawn>[0][number]) {
	const { spawn } = stubSpawn([{ status: 0, stdout: "2.30.0" }, whoami]);
	const rows: ProbeRow[] = [];
	await createPlugin({ vault: "rando", spawn }).probes.connection.run({
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: () => {},
		write: async () => undefined,
		cleanup: () => {},
	});
	return rows;
}

describe("connection probe", () => {
	it("asks `op` who is signed in, with no network step of its own", async () => {
		const rows = await connection({ status: 0, stdout: JSON.stringify({ email: "me@example.test" }) });
		expect(rows.map((r) => [r.status, r.label])).toEqual([
			["ok", "token"],
			["ok", "accepted"],
		]);
		expect(rows[1]!.detail).toBe("op: me@example.test");
	});

	it("says when `op` is not signed in", async () => {
		const rows = await connection({ status: 1, stderr: "not signed in" });
		expect(rows[1]).toMatchObject({ status: "fail", detail: expect.stringContaining("not signed in") });
	});
});
