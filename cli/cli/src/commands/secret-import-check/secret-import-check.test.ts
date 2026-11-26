import { describe, expect, it } from "vitest";

import type { Vault } from "../../plugin/index.js";
import { judgeImport, newSalt, readEnvironmentSecret } from "./secret-import-check.js";

const OLD = "old-value-0000";
const NEW = "new-value-1111";

/** A vault that can only read `values`; the rest of the interface is never touched. */
function vault(over: Partial<Vault>): Vault {
	return { providerName: "fake", ...over } as unknown as Vault;
}
const entries = (...pairs: Array<[string, string]>) =>
	vault({ readEnvironmentEntries: async () => pairs.map(([name, value]) => ({ name, value, concealed: true })) });

describe("readEnvironmentSecret", () => {
	it("reads a value as a salted fingerprint that is not the value", async () => {
		const salt = newSalt();
		const read = await readEnvironmentSecret(entries(["CRON_SECRET", OLD]), "env", "CRON_SECRET", salt);
		expect(read).toMatchObject({ status: "read", missing: false });
		expect(JSON.stringify(read)).not.toContain(OLD);
		const again = await readEnvironmentSecret(entries(["CRON_SECRET", OLD]), "env", "CRON_SECRET", salt);
		expect(again).toEqual(read);
		const other = await readEnvironmentSecret(entries(["CRON_SECRET", OLD]), "env", "CRON_SECRET", newSalt());
		expect(other).not.toEqual(read);
	});

	it("says missing, and blank", async () => {
		expect(await readEnvironmentSecret(entries(["OTHER", "x"]), "env", "CRON_SECRET", "s")).toEqual({
			status: "read",
			fingerprint: undefined,
			missing: true,
		});
		expect(await readEnvironmentSecret(entries(["CRON_SECRET", ""]), "env", "CRON_SECRET", "s")).toEqual({
			status: "read",
			fingerprint: undefined,
			missing: false,
		});
	});

	it("falls back to readEnvironment, and does not take a name off the prototype", async () => {
		const plain = vault({ readEnvironment: async () => ({ CRON_SECRET: OLD }) });
		expect(await readEnvironmentSecret(plain, "env", "CRON_SECRET", "s")).toMatchObject({ missing: false });
		expect(await readEnvironmentSecret(plain, "env", "toString", "s")).toMatchObject({ missing: true });
	});

	it("is unreadable with a reason when there is no vault, no read, or the read throws", async () => {
		expect(await readEnvironmentSecret(undefined, "env", "X", "s")).toMatchObject({ status: "unreadable" });
		expect(await readEnvironmentSecret(vault({}), "env", "X", "s")).toMatchObject({
			status: "unreadable",
			why: "fake cannot read an Environment",
		});
		const broken = vault({
			readEnvironmentEntries: async () => {
				throw new Error("op: not signed in");
			},
		});
		expect(await readEnvironmentSecret(broken, "env", "X", "s")).toEqual({
			status: "unreadable",
			why: "op: not signed in",
		});
	});
});

describe("judgeImport", () => {
	const read = async (value: string | undefined) =>
		readEnvironmentSecret(
			entries(...(value === undefined ? [] : ([["CRON_SECRET", value]] as Array<[string, string]>))),
			"env",
			"CRON_SECRET",
			"s"
		);

	it("is ok when the value changed", async () => {
		expect(judgeImport("CRON_SECRET", "env", await read(OLD), await read(NEW))).toMatchObject({ status: "ok" });
	});

	it("is ok for a secret that did not exist before", async () => {
		expect(judgeImport("CRON_SECRET", "env", await read(undefined), await read(NEW))).toMatchObject({
			status: "ok",
		});
	});

	it("fails when the value is the same, missing or blank, and the message holds no value", async () => {
		const same = judgeImport("CRON_SECRET", "env", await read(OLD), await read(OLD));
		expect(same).toMatchObject({ status: "fail" });
		expect(same.message).toMatch(/still holds the old value/);
		expect(same.message).not.toContain(OLD);
		expect(judgeImport("CRON_SECRET", "env", await read(OLD), await read(undefined))).toMatchObject({
			status: "fail",
		});
		expect(judgeImport("CRON_SECRET", "env", await read(OLD), await read(""))).toMatchObject({ status: "fail" });
	});

	it("is a skip when the Environment cannot be read afterwards, and says a change is not proved when it could not before", async () => {
		const unreadable = { status: "unreadable" as const, why: "offline" };
		expect(judgeImport("CRON_SECRET", "env", await read(OLD), unreadable)).toMatchObject({ status: "skip" });
		const unproved = judgeImport("CRON_SECRET", "env", unreadable, await read(NEW));
		expect(unproved.status).toBe("ok");
		expect(unproved.message).toMatch(/not proved/);
	});
});
