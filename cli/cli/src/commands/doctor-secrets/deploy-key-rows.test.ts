import { describe, expect, it } from "vitest";

import type { Vault } from "../../plugin/index.js";
import { deployKeyRows } from "./deploy-key-rows.js";

const vaultWith = (readEnvironment?: Vault["readEnvironment"]): Vault =>
	({ providerName: "1password", ...(readEnvironment ? { readEnvironment } : {}) }) as unknown as Vault;

describe("deployKeyRows", () => {
	it("names what would go out and what is kept back, never a value", async () => {
		const rows = await deployKeyRows(
			[{ environment: "prod", prefix: "SENTINEL_" }],
			vaultWith(async () => ({ SENTINEL_A: "s3cr3t", ADMIN_TOKEN: "hunter2" }))
		);
		expect(rows).toEqual([
			{
				id: "deploy-prod",
				title: "prod deployment receives only its keys",
				status: "ok",
				detail: "sends 1 of 2: SENTINEL_A; keeps back 1: ADMIN_TOKEN",
				problems: [],
			},
		]);
		expect(JSON.stringify(rows)).not.toMatch(/s3cr3t|hunter2/);
	});

	it("skips with the reason when there is no vault or it cannot list", async () => {
		const entries = [{ environment: "prod", keys: ["A"] }];
		expect((await deployKeyRows(entries, { why: "no vault" }))[0]).toMatchObject({
			status: "skip",
			detail: "no vault",
		});
		expect((await deployKeyRows(entries, vaultWith()))[0]).toMatchObject({ status: "skip" });
		const failing = await deployKeyRows(
			entries,
			vaultWith(async () => {
				throw new Error("boom");
			})
		);
		expect(failing[0]).toMatchObject({ status: "skip" });
		expect(failing[0]!.detail).toMatch(/could not read vault environment prod/);
	});
});
