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
	/** Why the document could not be synced; absent when it could. */
	problem?: string;
	/** The document's text after the sync; the same as before when the file needs no change. */
	text: string;
}

export interface SpecsSyncReport {
	status: "ok" | "fail" | "dry-run";
	/** One entry per document, in path order. */
	files: SpecSyncOutcome[];
	/** Why the run did not start. */
	message?: string;
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
	/** The address of a document's file on the default branch, or `undefined` when it is not known. */
	linkTo(path: string): string | undefined;
}
