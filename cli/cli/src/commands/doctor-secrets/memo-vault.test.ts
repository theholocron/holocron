import { describe, expect, it, vi } from "vitest";

import type { Vault } from "../../plugin/index.js";
import { memoVault } from "./memo-vault.js";

describe("memoVault", () => {
	it("reads each Environment once, errors included, and keeps the provider's other members", async () => {
		const readEnvironment = vi.fn(async (id: string) => {
			if (id === "bad") throw new Error("refused");
			return { A: "1" };
		});
		const vault = memoVault({ providerName: "1password", readEnvironment } as unknown as Vault);
		expect(vault.providerName).toBe("1password");
		await vault.readEnvironment!("ok");
		await vault.readEnvironment!("ok");
		await expect(vault.readEnvironment!("bad")).rejects.toThrow("refused");
		await expect(vault.readEnvironment!("bad")).rejects.toThrow("refused");
		expect(readEnvironment).toHaveBeenCalledTimes(2);
	});

	it("returns a vault that cannot read an Environment as it is", () => {
		const vault = { providerName: "x" } as unknown as Vault;
		expect(memoVault(vault)).toBe(vault);
	});
});
