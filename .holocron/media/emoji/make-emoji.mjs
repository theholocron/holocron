// Makes the server emoji pictures: each `svg/<name>.svg` (an Octicons icon, 24px or 16px, MIT, notice in `LICENSE`) is given the
// fill in COLOURS and rasterised to `<name>.png`, 128x128 and transparent (Discord takes at most 256 KiB).
//
//   node .holocron/media/emoji/make-emoji.mjs
//
// Needs `rsvg-convert` (librsvg; `brew bundle --file .humans/Brewfile`). To recolour an emoji, change its line below and
// run the script again. `setup notifications` never replaces an emoji the server has, so delete the old one in Discord
// first. The colours are Primer's dark theme (most Discord users are on it): fgColor-success #3fb950, -danger #f85149,
// -done #ab7df8, -muted #9198a1, -attention #d29922 (@primer/primitives, dist/css/functional/themes/dark.css).

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUCCESS = "#3fb950";
const DANGER = "#f85149";
const DONE = "#ab7df8";
const MUTED = "#9198a1";
const ATTENTION = "#d29922";

/** Emoji name (the file name without its extension) to its fill. */
const COLOURS = {
	git_branch: MUTED,
	git_branch_check: SUCCESS,
	git_commit: MUTED,
	git_compare: MUTED,
	git_merge: DONE,
	git_merge_queue: ATTENTION,
	git_pull_request: SUCCESS,
	git_pull_request_closed: DANGER,
	git_pull_request_draft: MUTED,
	// The 16px-only agent, locked and unlisted icons (a viewBox of 0 0 16 16 scales to the same 128x128).
	git_pull_request_agent: SUCCESS,
	git_draft_agent: MUTED,
	git_closed_agent: DANGER,
	git_merge_agent: DONE,
	git_merge_queue_agent: ATTENTION,
	git_pull_request_locked: ATTENTION,
	git_pull_request_unlisted: MUTED,
};

const SIZE = 128;
const here = dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "emoji-"));

try {
	for (const [name, colour] of Object.entries(COLOURS)) {
		const svg = readFileSync(join(here, "svg", `${name}.svg`), "utf8").replaceAll(
			"<path ",
			`<path fill="${colour}" `
		);
		const coloured = join(scratch, `${name}.svg`);
		writeFileSync(coloured, svg);
		const run = spawnSync(
			"rsvg-convert",
			["-w", String(SIZE), "-h", String(SIZE), coloured, "-o", join(here, `${name}.png`)],
			{ stdio: "inherit" }
		);
		if (run.error || run.status !== 0) {
			throw new Error(`rsvg-convert failed for ${name}: ${run.error?.message ?? `exit ${run.status}`}`);
		}
		console.log(`${name}.png  ${colour}`);
	}
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
