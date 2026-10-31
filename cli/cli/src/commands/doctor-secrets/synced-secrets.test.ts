import { describe, expect, it, vi } from "vitest";

import { MissingTokenError, type Vault } from "../../plugin/index.js";
import { syncedSecrets } from "./synced-secrets.js";

const vaultWith = (readEnvironment?: Vault["readEnvironment"]): Vault =>
	({ providerName: "doppler", ...(readEnvironment ? { readEnvironment } : {}) }) as unknown as Vault;

describe("syncedSecrets", () => {
	it("takes the listed keys without asking the vault", async () => {
		const readEnvironment = vi.fn();
		const got = await syncedSecrets(
			[{ environment: "prd", keys: ["A"], scope: "env=production" }],
			vaultWith(readEnvironment)
		);
		expect(got).toEqual({
			scopes: [{ scope: { kind: "environment", name: "production" }, names: ["A"] }],
			rows: [],
		});
		expect(readEnvironment).not.toHaveBeenCalled();
	});

	it("takes only the key names the vault holds, at the repo scope by default", async () => {
		const got = await syncedSecrets(
			[{ environment: "prd" }],
			vaultWith(async () => ({ A: "s3cr3t", B: "hunter2" }))
		);
		expect(got.scopes).toEqual([{ scope: { kind: "repo" }, names: ["A", "B"] }]);
		expect(JSON.stringify(got)).not.toMatch(/s3cr3t|hunter2/);
	});

	it("fails an entry whose scope cannot be read, and goes on", async () => {
		const got = await syncedSecrets(
			[
				{ environment: "prd", keys: ["A"], scope: "nope" },
				{ environment: "dev", keys: ["B"], scope: "org=o" },
			],
			vaultWith()
		);
		expect(got.rows.map((r) => [r.id, r.status, r.problems.length])).toEqual([["sync-prd", "fail", 1]]);
		expect(got.scopes).toEqual([{ scope: { kind: "organization", name: "o" }, names: ["B"] }]);
	});

	it("skips with the reason when there is no vault", async () => {
		const got = await syncedSecrets([{ environment: "prd" }], { why: "no vault" });
		expect(got.rows).toEqual([
			{
				id: "sync-prd",
				title: "prd vault environment is synced",
				status: "skip",
				detail: "no vault",
				problems: [],
			},
		]);
		expect(got.scopes).toEqual([]);
	});

	it("skips when the vault cannot list an environment", async () => {
		const got = await syncedSecrets([{ environment: "prd" }], vaultWith());
		expect(got.rows[0]).toMatchObject({
			status: "skip",
			detail: "vault provider (doppler) cannot list an environment's keys",
		});
	});

	it("skips on a missing token, and on a vault that cannot read the environment", async () => {
		const noToken = await syncedSecrets(
			[{ environment: "prd" }],
			vaultWith(async () => {
				throw new MissingTokenError("no DOPPLER_TOKEN set for doppler");
			})
		);
		expect(noToken.rows[0]!.status).toBe("skip");
		expect(noToken.rows[0]!.detail).toMatch(/DOPPLER_TOKEN/);

		const broken = await syncedSecrets(
			[{ environment: "prd" }],
			vaultWith(async () => {
				throw new Error("no such environment");
			})
		);
		expect(broken.rows[0]).toMatchObject({ status: "skip" });
		expect(broken.rows[0]!.detail).toMatch(/could not read vault environment prd: .*no such environment/);
	});
});
