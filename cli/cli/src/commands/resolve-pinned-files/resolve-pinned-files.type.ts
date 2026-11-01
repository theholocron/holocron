import type { NotificationsLayout } from "../../plugin/index.js";

/** What reading a layout's pinned-message files gave: the layout with every message's text filled in, or the first problem. */
export type ResolvedPinnedFiles = { layout: NotificationsLayout } | { problem: string };

/** Reads a file of the repository: the root, then the path relative to it. Tests pass their own. */
export type ReadRepoText = (root: string, file: string) => Promise<string>;
