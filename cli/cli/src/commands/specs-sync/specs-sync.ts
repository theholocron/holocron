/**
 * `holocron specs sync` -- keep each ADR and spec in step with a post in a forum channel.
 *
 * Every document under `docs/wiki/decisions`, `.notes` and `docs/wiki/specifications` gets one post (titled with the document's own title) made from the file, tagged with its status, and the post's address is written into the file as
 * `discussion.url`. The file stays the source of truth. A gatekeeper who changes a post's tag is asking for a status
 * change, and the run turns that into an edit of the file's `status:` line in the working tree; the workflow that runs
 * it commits the edit to a pull request, so nothing reaches the default branch without a review.
 *
 * Idempotent and safe to re-run, and the first run is the backfill. The posts are made, tagged and linked through the
 * `notifications` provider (Discord today); the rules are in `@theholocron/astromech/repo-validation`. `--dry-run`
 * reads and previews, and changes nothing.
 */

import { assignSpecIds, classifySpecPath, parseFrontmatter } from "@theholocron/astromech/repo-validation";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Notifications, PluginLoader } from "../../plugin/index.js";
import { style } from "../../ui/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import { notificationProviders, pickProvider } from "../notifications-channel-add/index.js";
import { forumChannel } from "./forum-channel.js";
import { rateLimitedFor } from "./rate-limit.js";
import { readDocuments } from "./read-documents.js";
import type { RunSpecsSyncInput, SpecDocument, SpecsSyncReport, SpecSyncOutcome } from "./specs-sync.type.js";
import { syncDocument } from "./sync-document.js";
import { withdrawDocument } from "./withdraw-document.js";

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

	// The default branch the id links to: the one the config declares, else `HEAD`, which GitHub resolves to the default branch.
	const branch = input.loaded.resolved.repo?.defaultBranch ?? "HEAD";
	const refreshOrigin = input.refresh || input.refreshOrigin;
	const refreshTitles = input.refresh || input.refreshTitles;

	// The id lines are rewritten, and counted, once the files are on the default branch: no open pull request, a known repo.
	const linking = !input.withdraw && repo !== undefined && input.pr === undefined;
	let documents: SpecDocument[];
	let syncOne: (doc: SpecDocument) => Promise<SpecSyncOutcome>;
	if (input.withdraw) {
		if (refreshOrigin || refreshTitles) {
			return refuse("`--withdraw` cannot be combined with `--refresh`, `--refresh-origin` or `--refresh-titles`");
		}
		if (!input.files) return refuse("`--withdraw` needs `--files`: the paths of the pull request's specs and ADRs");
		// The files are not in the working tree (it is the base branch), so the documents are the paths asked for.
		documents = [...new Set(input.files)].sort().flatMap((path) => {
			const kind = classifySpecPath(path);
			return kind ? [{ path, kind, text: "" }] : [];
		});
		syncOne = (doc) =>
			withdrawDocument(doc, {
				notifications,
				channel: forum.channel,
				dryRun,
				onBase: input.io.read(doc.path) !== undefined,
			});
	} else {
		const everything = readDocuments(input.io);
		const origins = new Map(everything.map((d) => [d.path, input.io.origin(d.path)]));
		// Specs are numbered here, oldest first, so a new spec takes the next number and the order never depends on who ran it.
		const ids = assignSpecIds(
			everything
				.filter((d) => d.kind === "spec")
				.map((d) => ({
					path: d.path,
					id: parseFrontmatter(d.text)?.get("id")?.value || undefined,
					time: origins.get(d.path)?.time,
				}))
		);

		// Numbered over every spec above, so a pull request's new spec takes the number the merged tree would give it; only the
		// files asked for are synced.
		const only = input.files ? new Set(input.files) : undefined;
		documents = only ? everything.filter((d) => only.has(d.path)) : everything;

		// A pull request still open is named by the caller; a merged one, by the commit that added the file.
		const prNumber = (path: string): number | undefined => input.pr ?? origins.get(path)?.pr;
		syncOne = (doc) =>
			syncDocument(doc, {
				notifications,
				channel: forum.channel,
				dryRun,
				quiet: !input.notify,
				...(refreshOrigin ? { refreshOrigin: true } : {}),
				...(refreshTitles ? { refreshTitles: true } : {}),
				...(input.refresh ? { refreshLinks: true } : {}),
				// The id links to the file on the default branch, which a pull request still open is not on yet: its `PR:` line is the link.
				...(linking ? { link: { repo: repo!, branch } } : {}),
				...(ids.has(doc.path) ? { assignedId: ids.get(doc.path)! } : {}),
				...(repo && prNumber(doc.path)
					? {
							pr: {
								number: prNumber(doc.path)!,
								url: `https://github.com/${repo}/pull/${prNumber(doc.path)}`,
							},
						}
					: {}),
			});
	}

	const files: SpecSyncOutcome[] = [];
	let ok = 0;
	let skipped = 0;
	let failed = 0;
	let rewritten = 0;
	let renamed = 0;
	let linked = 0;
	let rateLimited: SpecsSyncReport["rateLimited"];
	print(`\n${style.header(`ADRs and specs → #${forum.channel}`)}`);
	for (const doc of documents) {
		let outcome: SpecSyncOutcome;
		try {
			outcome = await syncOne(doc);
		} catch (err) {
			// A rate limit is not about this document. Stop here instead of firing calls that will be refused too: what is left
			// is made on the next run, which finds what this one made.
			const wait = rateLimitedFor(err);
			if (wait !== undefined) {
				rateLimited = { left: documents.length - files.length, retryAfter: wait };
				break;
			}
			outcome = { path: doc.path, did: [], problem: describeProviderError(err), text: doc.text };
			logger.warn({ path: doc.path, reason: logReason(err) }, "specs sync");
		}
		files.push(outcome);
		if (outcome.prLineRewritten) rewritten++;
		if (outcome.titleRenamed) renamed++;
		if (outcome.idLineRewritten) linked++;
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

	if (rateLimited) {
		const after = rateLimited.retryAfter > 0 ? `; it asks for ${rateLimited.retryAfter} seconds` : "";
		print(
			`  ${style.skip(`stopped: the provider is rate limiting${after}. ${rateLimited.left} document(s) are left for the next run`)}`
		);
		skipped += rateLimited.left;
	}

	if (refreshOrigin) {
		print(style.header(`${rewritten} PR line(s) ${dryRun ? "would be rewritten" : "rewritten"}`));
	}
	if (refreshTitles) {
		print(style.header(`${renamed} title(s) ${dryRun ? "would be renamed" : "renamed"}`));
	}
	if (input.refresh || linking) {
		print(style.header(`${linked} id line(s) ${dryRun ? "would be rewritten" : "rewritten"}`));
	}
	const status = failed > 0 ? "fail" : dryRun ? "dry-run" : "ok";
	print("");
	print(style.header(`${ok} ok, ${failed} fail, ${skipped} skipped`));
	logger.info(
		{ provider: notifications.providerName, channel: forum.channel, files: files.length, failed, status },
		"specs sync"
	);
	return {
		status,
		files,
		...(refreshOrigin ? { rewritten } : {}),
		...(refreshTitles ? { renamed } : {}),
		...(input.refresh || linking ? { linked } : {}),
		...(rateLimited ? { rateLimited } : {}),
	};
}
