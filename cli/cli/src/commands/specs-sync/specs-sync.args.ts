import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const specsSyncArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("provider", {
			type: "string",
			describe: "Which notifications provider, when several can keep discussion posts",
		})
		.option("channel", {
			type: "string",
			describe: "The forum channel the posts live in (default: the only forum the layout declares)",
		})
		.option("files", {
			type: "string",
			array: true,
			describe: "Sync only these ADR and spec files (a pull request's changed files)",
		})
		.option("pr", {
			type: "number",
			describe: "Name this pull request on the posts, for a pull request that is still open",
		})
		.option("refresh-origin", {
			type: "boolean",
			default: false,
			describe:
				"Rewrite the PR line of each existing post to the one the current rule names, and nothing else in it (a repair; combine with --dry-run to preview)",
		})
		.option("refresh-titles", {
			type: "boolean",
			default: false,
			describe:
				"Rename each existing post whose title differs from the current rule's, and change nothing else in it (a repair; combine with --dry-run to preview; stops cleanly at a rate limit)",
		})
		.option("refresh", {
			type: "boolean",
			default: false,
			describe:
				"Run every repair in one pass: the PR line, the title and the id line (a link to the file on the default branch), each changing only its own part of a post (combine with --dry-run to preview; stops cleanly at a rate limit)",
		})
		.option("withdraw", {
			type: "boolean",
			default: false,
			describe:
				"Tag the posts of --files withdrawn and close them, for a pull request closed without merging (run on the base branch)",
		})
		.option("notify", {
			type: "boolean",
			default: false,
			describe: "Let a new post notify people (off by default, so a backfill pings no one)",
		});

export type SpecsSyncArgs = InferArgs<typeof specsSyncArgs>;
