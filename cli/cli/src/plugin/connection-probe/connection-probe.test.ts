import { describe, expect, it } from "vitest";

import type { ProbeContext, ProbeRow } from "../probe/index.js";
import { connectionProbe } from "./connection-probe.js";

describe("connectionProbe", () => {
	it("is a read-only probe that checks the token with the plugin's verifyToken", async () => {
		const rows: ProbeRow[] = [];
		const secrets: Array<string | undefined> = [];
		const ctx: ProbeContext = {
			dryRun: false,
			say: (r) => void rows.push(r),
			secret: (v) => void secrets.push(v),
			write: async () => undefined,
			cleanup: () => {},
		};
		const probe = connectionProbe({
			provider: "Demo",
			token: () => "tok-123",
			verify: async () => ({ ok: true, subject: "user: someone" }),
		});
		expect(probe.writes).toBe(false);
		await probe.run(ctx);
		expect(rows).toEqual([
			{ status: "ok", label: "token", detail: "found" },
			{ status: "ok", label: "accepted", detail: "user: someone" },
		]);
		expect(secrets).toEqual(["tok-123"]);
	});
});
