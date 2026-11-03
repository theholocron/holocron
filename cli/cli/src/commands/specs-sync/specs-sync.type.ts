import type { SpecKind } from "@theholocron/astromech/repo-validation";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { Notifications, PluginLoader, RuntimeContext } from "../../plugin/index.js";

/** What `specs sync` reads and writes in the working tree, so a test can supply it without a disk. */
export interface SpecsSyncIo {
	/** The names of the files in a repo-relative folder; empty when the folder is missing. */
	list(dir: string): string[];
	/** A repo-relative file's text, or `undefined` when it does not exist or cannot be read. */
	read(path: string): string | undefined;
	/** Replaces a repo-relative file's text. */
	write(path: string, text: string): void;
	/** When a file was first committed and the pull request that added it, or `undefined` when its history cannot say. */
	origin(path: string): SpecOrigin | undefined;
}

/** Where a document came from, as its history says. */
export interface SpecOrigin {
	/** When the file was first committed, in seconds since the epoch. */
	time: number;
	/** The number of the pull request that added it, when the commit's subject names one (`(#1538)`). */
	pr?: number;
}

export interface RunSpecsSyncInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Where the ADRs and specs are read and the changes written. */
	io: SpecsSyncIo;
	/** Which `notifications` provider, when several can keep discussion posts. */
	provider?: string;
	/** The forum channel the posts live in; defaults to the one forum the layout declares. */
	channel?: string;
	/**
	 * Sync only these repo-relative paths (a pull request's changed files); a path that is not an ADR or spec is ignored.
	 * Unset, every document is synced.
	 */
	files?: string[];
	/** The pull request to name on a post, instead of the one the file's history names (a pull request still open). */
	pr?: number;
	/**
	 * Rewrite the pull request line of each existing post to the one the current rule would write, and nothing else in it.
	 * A repair for posts made under an older rule; off by default, so a normal run never edits a post's first message.
	 */
	refreshOrigin?: boolean;
	/**
	 * Rename each existing post whose title differs from the one the current rule writes, and change nothing else in it.
	 * A repair for posts made under an older rule; off by default, so a title a gatekeeper changed by hand is not
	 * overwritten on every run. A rate limit stops it cleanly, and the next run continues.
	 */
	refreshTitles?: boolean;
	/**
	 * Withdraw the posts of `files` instead of syncing them: tag each `withdrawn` and close it, for a pull request that was
	 * closed unmerged. The files need not exist in the working tree, which is the base branch's, and a path that does exist
	 * there keeps its post. Needs `files`.
	 */
	withdraw?: boolean;
	/** Let a new post notify people. Off by default, so a backfill of many posts pings no one. */
	notify?: boolean;
	loader?: PluginLoader;
	print?: (line: string) => void;
	logger?: Logger;
}

/** An ADR or a spec, as `specs sync` reads it. */
export interface SpecDocument {
	/** The repo-relative path; it is also the key of the document's discussion post. */
	path: string;
	/** Whether it is an ADR or a spec. */
	kind: SpecKind;
	/** The file's text. */
	text: string;
}

/** What `specs sync` did, or would do, for one document. */
export interface SpecSyncOutcome {
	/** The document's repo-relative path. */
	path: string;
	/** What was done (or, on a dry run, would be): empty when the post and the file were already in step. */
	did: string[];
	/** Set when the post's pull request line was (on a dry run, would be) rewritten by `refreshOrigin`. */
	prLineRewritten?: boolean;
	/** Set when the post was (on a dry run, would be) renamed by `refreshTitles`. */
	titleRenamed?: boolean;
	/** Why the document could not be synced; absent when it could. */
	problem?: string;
	/** The document's text after the sync; the same as before when the file needs no change. */
	text: string;
}

export interface SpecsSyncReport {
	status: "ok" | "fail" | "dry-run";
	/** One entry per document, in path order. */
	files: SpecSyncOutcome[];
	/** With `refreshOrigin`: how many posts had (or, on a dry run, would have) their pull request line rewritten. */
	rewritten?: number;
	/** With `refreshTitles`: how many posts were (on a dry run, would be) renamed. */
	renamed?: number;
	/** Why the run did not start. */
	message?: string;
	/** Set when the provider's rate limit stopped the run early: how many documents were left, and how many seconds it asked to be left alone for (`0` when it did not say). */
	rateLimited?: {
		/** The documents not yet tried. */
		left: number;
		/** Seconds the provider asked for. */
		retryAfter: number;
	};
}

/** What `syncDocument` needs besides the document. */
export interface SyncDocumentDeps {
	/** The provider; it must implement the three discussion methods. */
	notifications: Notifications;
	/** The forum channel's name. */
	channel: string;
	/** Preview: read, but make and change nothing. */
	dryRun: boolean;
	/** Post without notifying anyone. */
	quiet: boolean;
	/** The pull request that added the document, with its address, when both are known. */
	pr?: { number: number; url: string };
	/** Rewrite the post's pull request line when it differs from the one `pr` gives (or, with no `pr`, take it out). */
	refreshOrigin?: boolean;
	/** Rename the post when its title differs from the one the current rule writes. */
	refreshTitles?: boolean;
	/** The id `assignSpecIds` gave the document, when it had none. */
	assignedId?: string;
}

/** What `withdrawDocument` needs besides the document. */
export interface WithdrawDocumentDeps {
	/** The provider; it must implement the discussion methods. */
	notifications: Notifications;
	/** The forum channel's name. */
	channel: string;
	/** Preview: read, but change nothing. */
	dryRun: boolean;
	/** Whether the working tree (the base branch) already has the file, so its post is the merged file's. */
	onBase: boolean;
}
