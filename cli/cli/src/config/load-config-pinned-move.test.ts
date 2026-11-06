import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolvePinnedFiles } from "../commands/resolve-pinned-files/index.js";
import type { NotificationsLayout } from "../plugin/index.js";
import { loadConfig } from "./config-system.js";

/** This repository's root: the real `holocron.config.ts` and `.holocron/` are loaded, not a copy. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** SHA-256 of the root `RULES.md` and of `media/webhook-avatar.png` as they were before #1788 moved them. */
const RULES_SHA256 = "f25183e947a9ed1839fb72f01f7692d185cfe2b1ebb592cd158c03def623ade6";
const AVATAR_SHA256 = "89f1089dc24f06f6528f357bce342ff149dd7c63d099631f49112d2c636c225f";

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

describe("RULES.md and the webhook avatar moved into .holocron/ (#1788)", () => {
	async function layoutOf(): Promise<NotificationsLayout> {
		const { resolved } = await loadConfig(REPO_ROOT);
		const notifications = resolved.providers.notifications as unknown as {
			tuples: { options: { layout: NotificationsLayout } }[];
		};
		return notifications.tuples[0].options.layout;
	}

	it("names the new paths in the real config", async () => {
		const layout = await layoutOf();
		expect(layout.pinned).toContainEqual({ channel: "rules", file: ".holocron/pinned/rules.md" });
		expect(layout.webhookAvatar).toBe(".holocron/media/webhook-avatar.png");
	});

	it("resolves #rules from the new path with the text the root file had", async () => {
		const resolved = await resolvePinnedFiles(await layoutOf(), REPO_ROOT);
		expect(resolved).not.toHaveProperty("problem");
		const rules = "layout" in resolved ? resolved.layout.pinned?.find((pin) => pin.channel === "rules") : undefined;
		const text = await readFile(join(REPO_ROOT, ".holocron/pinned/rules.md"), "utf8");
		// The file is byte-for-byte the old root file (moved with `git mv`), and the message is that text.
		expect(sha256(text)).toBe(RULES_SHA256);
		expect(rules?.content).toBe(text.trimEnd());
	});

	it("leaves no RULES.md at the root, and the avatar is an existing, unchanged file", async () => {
		await expect(stat(join(REPO_ROOT, "RULES.md"))).rejects.toMatchObject({ code: "ENOENT" });
		const avatar = join(REPO_ROOT, (await layoutOf()).webhookAvatar as string);
		expect((await stat(avatar)).isFile()).toBe(true);
		expect(sha256(await readFile(avatar))).toBe(AVATAR_SHA256);
	});
});
