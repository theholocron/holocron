/** Where ADRs live, relative to the repo root. */
export const ADR_DIR = "docs/wiki/decisions";

/** Where specs live, relative to the repo root: in-progress ones in `.notes`, settled ones under the wiki. */
export const SPEC_DIRS: readonly string[] = [".notes", "docs/wiki/specifications"];

/** The statuses an ADR may have. */
export const ADR_STATUSES: readonly string[] = ["proposed", "accepted", "rejected", "deprecated", "superseded"];

/** The statuses a spec may have. */
export const SPEC_STATUSES: readonly string[] = ["draft", "proposed", "accepted", "archived", "superseded"];

/** The files in the ADR folder that are not ADRs. */
export const ADR_EXEMPT: readonly string[] = ["template.md", "README.md"];
