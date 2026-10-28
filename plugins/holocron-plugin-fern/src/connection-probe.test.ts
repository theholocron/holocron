import type { ProbeRow } from "@theholocron/cli";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlugin } from "./index.js";

afterEach(() => vi.unstubAllEnvs());

describe("connection probe", () => {
	it("looks the token up under the org, the way `holocron auth set fern` stores it", async () => {
		const asked: string[] = [];
		const rows: ProbeRow[] = [];
		await createPlugin({
			org: "theholocron",
			env: {},
			keyring: (key: string) => (asked.push(key), key === "fern.theholocron" ? "stored-tok" : null),
		}).probes.connection.run({
			dryRun: false,
			say: (r) => void rows.push(r),
			secret: () => {},
			write: async () => undefined,
			cleanup: () => {},
		});
		expect(asked).toContain("fern.theholocron");
		expect(rows.find((r) => r.label === "token")).toMatchObject({ status: "ok" });
	});

	it("checks there is a token to use, since Fern has no way to check it", async () => {
		vi.stubEnv("HOLOCRON_FERN_TOKEN", "fern-tok");
		const rows: ProbeRow[] = [];
		const secrets: Array<string | undefined> = [];
		await createPlugin().probes.connection.run({
			dryRun: false,
			say: (r) => void rows.push(r),
			secret: (v) => void secrets.push(v),
			write: async () => undefined,
			cleanup: () => {},
		});
		expect(rows.map((r) => [r.status, r.label])).toEqual([
			["ok", "token"],
			["ok", "accepted"],
		]);
		expect(secrets).toEqual(["fern-tok"]);
	});
});
