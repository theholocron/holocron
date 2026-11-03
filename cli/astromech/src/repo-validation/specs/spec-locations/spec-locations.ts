/** Where ADRs live, relative to the repo root. */
export const ADR_DIR = "docs/wiki/decisions";

/** Where specs live, relative to the repo root: in-progress ones in `.notes`, settled ones under the wiki. */
export const SPEC_DIRS: readonly string[] = [".notes", "docs/wiki/specifications"];

/** The statuses an ADR may have. */
export const ADR_STATUSES: readonly string[] = ["proposed", "accepted", "rejected", "deprecated", "superseded"];

/** The statuses a spec may have. */
export const SPEC_STATUSES: readonly string[] = ["draft", "proposed", "accepted", "archived", "superseded"];

/**
 * The statuses that mean a document is finished with: a spec that shipped or was dropped, one that was replaced, an ADR
 * that was turned down or is no longer followed. Its discussion is closed and locked, so it does not start up again;
 * the others (`draft`, `proposed`, `accepted`) stay open, since an accepted document is still asked about.
 */
export const CLOSED_STATUSES: readonly string[] = ["archived", "superseded", "rejected", "deprecated"];

/**
 * The tag a discussion post carries while its pull request is closed unmerged. It is a state of the post only: no file
 * may have it as its `status` (`ADR_STATUSES` and `SPEC_STATUSES` leave it out), and `reconcileSpecStatus` never reads it
 * as a gatekeeper's retag. A post with it is closed, like one with a finished status.
 */
export const WITHDRAWN_STATE = "withdrawn";

/** The files in the ADR folder that are not ADRs. */
export const ADR_EXEMPT: readonly string[] = ["template.md", "README.md"];
