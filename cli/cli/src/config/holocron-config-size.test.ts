import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The most lines `holocron.config.ts` may have. It was 426 lines before #1747 and is 154 now, once the Discord server
 * layout (`.holocron/notifications.ts`) and the `repo` block (`.holocron/repo.ts`) moved out. 215 leaves room for a few
 * new tasks, providers and comments, but not for a declaration the size of the old layout: a block that big belongs in
 * `.holocron/<area>.ts` (spec `tech-holocron-directory`), not back in the index. If a real addition needs more, raise
 * this number in the same PR and say why; the point is that growing the file is a decision, not a drift. Raised from
 * 200 for the `doctor.manualSecrets` list (#2183): a declaration of names that is not an area, so it stays here, and to
 * 220 for the `tooling` provider, which names the apps' request files (#2172), and to 230 for the environment files
 * Sentinel's requests gained (a local, a dev and a prod one), and to 260 for the `monitoring` provider (#2302): its docs check,
 * dashboard and status page span the apps, so they are declared at the root and not in an app's config, and to 270 for the
 * dashboard's description and domain (#2339), and to 280 for the status page's footer and links (#2344).
 */
const MAX_LINES = 280;

const CONFIG = fileURLToPath(new URL("../../../../holocron.config.ts", import.meta.url));

describe("holocron.config.ts size (#1806)", () => {
	it(`stays an index of at most ${MAX_LINES} lines`, async () => {
		const lines = (await readFile(CONFIG, "utf8")).trimEnd().split("\n").length;
		expect(
			lines,
			`holocron.config.ts has ${lines} lines (budget ${MAX_LINES}); move the big declaration to .holocron/<area>.ts`
		).toBeLessThanOrEqual(MAX_LINES);
	});
});
