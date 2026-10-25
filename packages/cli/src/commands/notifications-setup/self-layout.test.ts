import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../config/index.js";
import type { NotificationsLayout } from "../../plugin/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** The layout this repo declares for its own server, found in its own holocron.config.ts. */
async function ownLayout(): Promise<NotificationsLayout | undefined> {
	const { resolved } = await loadConfig(repoRoot);
	const entry = resolved.providers?.notifications;
	const tuples = !entry ? [] : entry.cardinality === "many" ? entry.tuples : [entry.tuple];
	for (const tuple of tuples) {
		const layout = (tuple.options as { layout?: NotificationsLayout } | undefined)?.layout;
		if (layout) return layout;
	}
	return undefined;
}

describe("this repo's own server layout", () => {
	it("keeps ordinary members from pinging everyone or adding expressions and events", async () => {
		const layout = await ownLayout();
		expect(layout?.everyone?.deny).toEqual(
			expect.arrayContaining(["MentionEveryone", "CreateGuildExpressions", "CreateEvents"])
		);
		// A permission cannot be both denied and allowed: `setup` refuses a layout that says so.
		const allowed = layout?.everyone?.allow ?? [];
		expect(allowed.filter((p) => layout?.everyone?.deny?.includes(p))).toEqual([]);
	});
});
