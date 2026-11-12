import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it } from "vitest";

import { assertSyncableLayer, isUnsyncedLayer, unsyncedLayerMessage } from "./unsynced-layer.js";

const gitExec = async () => "git@github.com:theholocron/holocron.git\n";

describe("isUnsyncedLayer", () => {
	it("is true for local and dev only", () => {
		expect(["local", "dev", "ci", "prod", "Dev", 3].map(isUnsyncedLayer)).toEqual([
			true,
			true,
			false,
			false,
			false,
			false,
		]);
	});
});

describe("unsyncedLayerMessage", () => {
	it("says the layer is read by this machine and names ci and prod as the layers that can be synced", () => {
		const message = unsyncedLayerMessage("a thing", "dev");
		expect(message).toContain("`dev` layer");
		expect(message).toContain("read by this machine and are never synced");
		expect(message).toContain("`ci` and `prod`");
	});
});

describe("assertSyncableLayer", () => {
	it.each(["local", "dev"])("refuses the layer word %s", async (word) => {
		const err = await assertSyncableLayer(word, { repoRoot: "/r", gitExec }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toContain(`sync secrets ${word}`);
	});

	it.each(["local", "dev"])("refuses the derived Environment name of the %s layer", async (layer) => {
		const err = await assertSyncableLayer(`theholocron/holocron - ${layer}`, { repoRoot: "/r", gitExec }).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toContain(`\`${layer}\` layer`);
	});

	it("allows ci, prod and any other literal name", async () => {
		await expect(assertSyncableLayer("ci", { repoRoot: "/r", gitExec: async () => "" })).resolves.toBeUndefined();
		await expect(assertSyncableLayer("prod", { repoRoot: "/r", gitExec })).resolves.toBeUndefined();
		await expect(assertSyncableLayer("Sentinel", { repoRoot: "/r", gitExec })).resolves.toBeUndefined();
		await expect(
			assertSyncableLayer("theholocron/holocron - ci", { repoRoot: "/r", gitExec })
		).resolves.toBeUndefined();
	});

	it("allows a literal name when the remote cannot be read", async () => {
		await expect(
			assertSyncableLayer("Sentinel", { repoRoot: "/r", gitExec: async () => "" })
		).resolves.toBeUndefined();
	});
});
