import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { stubSpawn } from "../helpers.js";
import { OpShell } from "../shell.js";
import { OpVault } from "./vault.js";

function makeVault(responses: Parameters<typeof stubSpawn>[0], opts: { account?: string } = {}) {
	const { spawn, calls } = stubSpawn(responses);
	const shellOpts: ConstructorParameters<typeof OpShell>[0] = { spawn };
	if (opts.account !== undefined) shellOpts.account = opts.account;
	const shell = new OpShell(shellOpts);
	const vault = new OpVault(shell, { vault: "rando" });
	return { vault, calls };
}

// ──────────────────────────────────────────────────────────────────────
// read
// ──────────────────────────────────────────────────────────────────────

describe("OpVault.read", () => {
	it("shells out to `op read <ref> --no-newline`", async () => {
		const { vault, calls } = makeVault([{ status: 0, stdout: "sk_test_secret" }]);
		const result = await vault.read("op://rando/CLERK/secret_key");
		expect(calls[0]?.args).toEqual(["read", "op://rando/CLERK/secret_key", "--no-newline"]);
		expect(result).toBe("sk_test_secret");
	});

	it("throws ProviderApiError on non-zero", async () => {
		const { vault } = makeVault([{ status: 1, stderr: "[ERROR] not found" }]);
		await expect(vault.read("op://rando/MISSING/x")).rejects.toBeInstanceOf(ProviderApiError);
	});
});

// ──────────────────────────────────────────────────────────────────────
// write — exists path (probe + edit)
// ──────────────────────────────────────────────────────────────────────

describe("OpVault.write — existing item path", () => {
	it("probes `op item get`, then `op item edit` when the item exists", async () => {
		const { vault, calls } = makeVault([
			// 1. probe (exists)
			{ status: 0, stdout: JSON.stringify({ id: "item_id", title: "CLERK" }) },
			// 2. edit
			{ status: 0, stdout: "" },
		]);
		await vault.write("op://rando/CLERK/secret_key", "new-value");

		expect(calls[0]?.args).toEqual(["item", "get", "CLERK", "--vault=rando", "--format=json"]);
		expect(calls[1]?.args).toEqual(["item", "edit", "CLERK", "--vault=rando", "secret_key=new-value"]);
	});

	it("throws ProviderApiError when the edit fails", async () => {
		const { vault } = makeVault([
			{ status: 0, stdout: "{}" }, // probe exists
			{ status: 1, stderr: "edit failed" }, // edit fails
		]);
		await expect(vault.write("op://rando/CLERK/secret_key", "x")).rejects.toThrow(/edit failed/);
	});
});

// ──────────────────────────────────────────────────────────────────────
// write — create-fallback path
// ──────────────────────────────────────────────────────────────────────

describe("OpVault.write — create-fallback path", () => {
	it("falls back to `op item create --category=API Credential` when the probe returns non-zero", async () => {
		const { vault, calls } = makeVault([
			{ status: 1, stderr: "[ERROR] item not found" }, // probe missing
			{ status: 0, stdout: "" }, // create
		]);
		await vault.write("op://rando/NEW_SECRET/value", "fresh-value");

		expect(calls[1]?.args).toEqual([
			"item",
			"create",
			"--title=NEW_SECRET",
			"--vault=rando",
			"--category=API Credential",
			"value=fresh-value",
		]);
	});

	it("throws ProviderApiError when the create fails", async () => {
		const { vault } = makeVault([
			{ status: 1, stderr: "missing" }, // probe
			{ status: 1, stderr: "vault not found" }, // create
		]);
		await expect(vault.write("op://wrong/X/v", "x")).rejects.toThrow(/vault not found/);
	});
});

// ──────────────────────────────────────────────────────────────────────
// reference parsing
// ──────────────────────────────────────────────────────────────────────

describe("OpVault.write — reference parsing", () => {
	it("throws on a reference without the op:// prefix", async () => {
		const { vault } = makeVault([]);
		await expect(vault.write("rando/X/v", "x")).rejects.toThrow(/must start with "op:\/\/"/);
	});

	it("throws on a reference missing required parts", async () => {
		const { vault } = makeVault([]);
		await expect(vault.write("op://only-vault", "x")).rejects.toThrow(/missing parts/);
	});

	it("allows a slash inside the field portion (e.g., nested field paths)", async () => {
		const { vault, calls } = makeVault([
			{ status: 0, stdout: "{}" }, // probe exists
			{ status: 0, stdout: "" }, // edit
		]);
		await vault.write("op://rando/Item/section/nested", "v");
		expect(calls[1]?.args).toContain("section/nested=v");
	});
});

// ──────────────────────────────────────────────────────────────────────
// list
// ──────────────────────────────────────────────────────────────────────

describe("OpVault.list", () => {
	it("runs `op item list --vault=<vault> --format=json` and returns titles", async () => {
		const { vault, calls } = makeVault([
			{
				status: 0,
				stdout: JSON.stringify([
					{ id: "1", title: "CLERK" },
					{ id: "2", title: "NEON" },
				]),
			},
		]);
		const result = await vault.list();
		expect(calls[0]?.args).toEqual(["item", "list", "--vault=rando", "--format=json"]);
		expect(result).toEqual(["CLERK", "NEON"]);
	});

	it("returns [] when op outputs empty", async () => {
		const { vault } = makeVault([{ status: 0, stdout: "" }]);
		expect(await vault.list()).toEqual([]);
	});
});

// ──────────────────────────────────────────────────────────────────────
// environments
// ──────────────────────────────────────────────────────────────────────

describe("OpVault.environments", () => {
	it("is not offered: no `op` command lists Environments", () => {
		const { vault } = makeVault([]);
		expect("environments" in vault).toBe(false);
	});
});

describe("OpVault.readEnvironment", () => {
	it("reads by name or id through `op environment secret list --reveal --format=dotenv`", async () => {
		const stdout = [
			"CLERK_SECRET_KEY=sk_test_xxx",
			"NEON_DATABASE_URL=postgresql://...",
			"",
			"# comment line — ignored",
			"EMPTY_VALUE=",
		].join("\n");
		const { vault, calls } = makeVault([{ status: 0, stdout }]);
		const result = await vault.readEnvironment!("holocron");
		expect(calls[0]?.args).toEqual(["environment", "secret", "list", "holocron", "--reveal", "--format=dotenv"]);
		expect(result).toEqual({
			CLERK_SECRET_KEY: "sk_test_xxx",
			NEON_DATABASE_URL: "postgresql://...",
			EMPTY_VALUE: "",
		});
	});

	it("passes --account first when the vault was made with one", async () => {
		const { vault, calls } = makeVault([{ status: 0, stdout: "A=1" }], { account: "ACCT" });
		await vault.readEnvironment!("holocron");
		expect(calls[0]?.args.slice(0, 2)).toEqual(["--account", "ACCT"]);
	});

	it("unquotes quoted values", async () => {
		const { vault } = makeVault([{ status: 0, stdout: "A=\"x y\"\nB='raw $1'" }]);
		expect(await vault.readEnvironment!("holocron")).toEqual({ A: "x y", B: "raw $1" });
	});

	it("throws ProviderApiError when op fails", async () => {
		const { vault } = makeVault([{ status: 1, stderr: "environment not found" }]);
		await expect(vault.readEnvironment!("missing")).rejects.toThrow(/environment not found/);
	});

	it("works with no vault configured", async () => {
		const { spawn } = stubSpawn([{ status: 0, stdout: "A=1" }]);
		const vault = new OpVault(new OpShell({ spawn }), {});
		expect(await vault.readEnvironment!("holocron")).toEqual({ A: "1" });
	});
});

describe("OpVault.readSecret", () => {
	it("reads one variable of the configured Environment by its bare name", async () => {
		const { spawn, calls } = stubSpawn([{ status: 0, stdout: "A=1\nCOMLINK_SENTRY_SECRET=s3cret" }]);
		const vault = new OpVault(new OpShell({ spawn }), { environment: "Comlink" });
		expect(await vault.readSecret("COMLINK_SENTRY_SECRET")).toBe("s3cret");
		expect(calls[0]?.args).toEqual(["environment", "secret", "list", "Comlink", "--reveal", "--format=dotenv"]);
	});

	it("says which variable is missing from the Environment", async () => {
		const { spawn } = stubSpawn([{ status: 0, stdout: "A=1" }]);
		const vault = new OpVault(new OpShell({ spawn }), { environment: "Comlink" });
		const err = await vault.readSecret("B").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).message).toMatch(/Comlink has no variable B/);
	});

	it("refuses without an `environment`, and does not call op", async () => {
		const { spawn, calls } = stubSpawn([]);
		const vault = new OpVault(new OpShell({ spawn }), {});
		const err = await vault.readSecret("A").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).message).toMatch(/needs an `environment`/);
		expect(calls).toEqual([]);
	});
});

// ──────────────────────────────────────────────────────────────────────
// Construction
// ──────────────────────────────────────────────────────────────────────

describe("OpVault construction", () => {
	it("needs no `vault`", () => {
		const { spawn } = stubSpawn([]);
		expect(() => new OpVault(new OpShell({ spawn }), {})).not.toThrow();
		expect(() => new OpVault(new OpShell({ spawn }), { vault: "" })).not.toThrow();
	});

	it("refuses to list items without a vault", async () => {
		const { spawn, calls } = stubSpawn([]);
		const vault = new OpVault(new OpShell({ spawn }), {});
		const err = await vault.list().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).message).toMatch(/needs a `vault`/);
		expect(calls).toEqual([]);
	});
});
