import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../config-system.js";

/** `layout: { ... }` exactly as `holocron.config.ts` had it inline before #1786 (a copy of the old text; only the two paths #1788 moved are updated). */
const INLINE_LAYOUT = new URL("./notifications-layout.inline.fixture.txt", import.meta.url);
/** The file the layout moved to: this repo's own `.holocron/notifications.ts`. */
const MOVED_LAYOUT = fileURLToPath(new URL("../../../../../.holocron/notifications.ts", import.meta.url));

/** The sibling the layout imports its zone from: this repo's own `.holocron/org.ts`. */
const MOVED_ORG = fileURLToPath(new URL("../../../../../.holocron/org.ts", import.meta.url));

const GUILD_ID = "1303969001822486568";
const base = (layout: string) =>
	`export default {
	name: "demo",
	providers: {
		source: "github",
		notifications: ["discord", { guildId: "${GUILD_ID}"${layout}}],
	},
};
`;

describe("the notifications layout moved to .holocron/notifications.ts (#1786)", () => {
	let inline: string;
	let moved: string;

	beforeEach(async () => {
		inline = await mkdtemp(join(tmpdir(), "holocron-layout-inline-"));
		moved = await mkdtemp(join(tmpdir(), "holocron-layout-moved-"));
	});
	afterEach(async () => {
		await rm(inline, { recursive: true, force: true });
		await rm(moved, { recursive: true, force: true });
	});

	it("resolves to the same notifications provider as the old inline text", async () => {
		await writeFile(join(inline, "holocron.config.ts"), base(`, layout: ${await readFile(INLINE_LAYOUT, "utf8")}`));
		await writeFile(join(moved, "holocron.config.ts"), base(""));
		await mkdir(join(moved, ".holocron"));
		await copyFile(MOVED_LAYOUT, join(moved, ".holocron", "notifications.ts"));
		// The layout imports the zone from its sibling org file (the one place `domain` is spelled), as Sentinel's
		// sandbox has it: the whole `.holocron/` tree is written beside the config.
		await copyFile(MOVED_ORG, join(moved, ".holocron", "org.ts"));

		const before = (await loadConfig(inline)).resolved.providers.notifications;
		const after = (await loadConfig(moved)).resolved.providers.notifications;

		expect(after).toEqual(before);
		// Guard against a vacuous pass: the layout really is there on both sides.
		expect(before).toMatchObject({
			tuples: [{ options: { guildId: GUILD_ID, layout: { relay: expect.anything() } } }],
		});
	});
});
