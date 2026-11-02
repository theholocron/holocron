/**
 * `holocron specs sync` -- keep each ADR and spec in step with a post in a forum channel.
 *
 * Every document under `docs/wiki/decisions`, `.notes` and `docs/wiki/specifications` gets one post (titled `SPEC:` or
 * `ADR:`) made from the file, tagged with its status, and the post's address is written into the file as
 * `discussion.url`. The file stays the source of truth. A gatekeeper who changes a post's tag is asking for a status
 * change, and the run turns that into an edit of the file's `status:` line in the working tree; the workflow that runs
 * it commits the edit to a pull request, so nothing reaches the default branch without a review.
 *
 * Idempotent and safe to re-run, and the first run is the backfill. The posts are made, tagged and linked through the
 * `notifications` provider (Discord today); the rules are in `@theholocron/astromech/repo-validation`. `--dry-run`
 * reads and previews, and changes nothing.
 */

import { assignSpecIds, parseFrontmatter } from "@theholocron/astromech/repo-validation";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Notifications, PluginLoader } from "../../plugin/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import { style } from "../../ui/style/index.js";
import { notificationProviders, pickProvider } from "../notifications-channel-add/index.js";
import { forumChannel } from "./forum-channel.js";
import { readDocuments } from "./read-documents.js";
import type { RunSpecsSyncInput, SpecsSyncReport, SpecSyncOutcome } from "./specs-sync.type.js";
import { syncDocument } from "./sync-document.js";

/** The provider that can keep a post per document. */
export function pickDiscussionProvider(providers: Notifications[], wanted?: string): Notifications {
	return pickProvider(
		providers,
		wanted,
		(p) =>
			typeof p.ensureDiscussion === "function" &&
			typeof p.readDiscussion === "function" &&
			typeof p.updateDiscussion === "function",
		{ infinitive: "keep discussion posts", gerund: "keeping discussion posts" }
	);
}

export async function runSpecsSync(input: RunSpecsSyncInput): Promise<SpecsSyncReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "specs sync");

	const dryRun = input.context.dryRun ?? false;
	const refuse = (message: string, reason: string = message): SpecsSyncReport => {
		print(`  ${style.fail(message)}`);
		print("");
		print(style.header("0 ok, 1 fail, 0 skipped"));
		logger.warn({ reason }, "specs sync");
		return { status: "fail", files: [], message };
	};

	let notifications: Notifications;
	try {
		notifications = pickDiscussionProvider(notificationProviders(loader), input.provider);
	} catch (err) {
		return refuse(errorMessage(err));
	}
	const layout = notifications.layout;
	if (!layout) {
		return refuse(
			`the \`${notifications.providerName}\` provider declares no layout — add \`layout\` to its options in holocron.config.ts`
		);
	}
	const forum = forumChannel(layout, input.channel);
	if ("problem" in forum) return refuse(forum.problem);

	// The pull request that added a document is linked from its post, when the repo is known.
	const repo =
		input.context.repo ??
		(input.context.org && input.loaded.resolved.name
			? `${input.context.org}/${input.loaded.resolved.name}`
			: undefined);

	const documents = readDocuments(input.io);
	const origins = new Map(documents.map((d) => [d.path, input.io.origin(d.path)]));
	// Specs are numbered here, oldest first, so a new spec takes the next number and the order never depends on who ran it.
	const ids = assignSpecIds(
		documents
			.filter((d) => d.kind === "spec")
			.map((d) => ({
				path: d.path,
				id: parseFrontmatter(d.text)?.get("id")?.value || undefined,
				time: origins.get(d.path)?.time,
			}))
	);

	const files: SpecSyncOutcome[] = [];
	let ok = 0;
	let skipped = 0;
	let failed = 0;
	print(`\n${style.header(`ADRs and specs → #${forum.channel}`)}`);
	for (const doc of documents) {
		let outcome: SpecSyncOutcome;
		try {
			outcome = await syncDocument(doc, {
				notifications,
				channel: forum.channel,
				dryRun,
				quiet: !input.notify,
				...(ids.has(doc.path) ? { assignedId: ids.get(doc.path)! } : {}),
				...(repo && origins.get(doc.path)?.pr
					? {
							pr: {
								number: origins.get(doc.path)!.pr!,
								url: `https://github.com/${repo}/pull/${origins.get(doc.path)!.pr}`,
							},
						}
					: {}),
			});
		} catch (err) {
			outcome = { path: doc.path, did: [], problem: describeProviderError(err), text: doc.text };
			logger.warn({ path: doc.path, reason: logReason(err) }, "specs sync");
		}
		files.push(outcome);
		if (outcome.problem) {
			print(`  ${style.fail(`${outcome.path}: ${outcome.problem}`)}`);
			failed++;
		} else if (outcome.did.length === 0) {
			print(`  ${style.skip(`${outcome.path}: in step`)}`);
			skipped++;
		} else {
			print(`  ${(dryRun ? style.skip : style.success)(`${outcome.path}: ${outcome.did.join("; ")}`)}`);
			if (dryRun) skipped++;
			else ok++;
			// The working tree is the only thing the run writes; the posts are changed through the provider.
			if (!dryRun && outcome.text !== doc.text) input.io.write(doc.path, outcome.text);
		}
	}

	const status = failed > 0 ? "fail" : dryRun ? "dry-run" : "ok";
	print("");
	print(style.header(`${ok} ok, ${failed} fail, ${skipped} skipped`));
	logger.info(
		{ provider: notifications.providerName, channel: forum.channel, files: files.length, failed, status },
		"specs sync"
	);
	return { status, files };
}
