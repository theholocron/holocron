/**
 * What git says about a path: `ignored` when a rule ignores it, `tracked` when git would track it, `no-repo` when the
 * path is not in a git repository (or git is not installed, in which case nothing can commit it), and `unknown` when
 * git failed in some other way.
 */
export type GitIgnoreState = "ignored" | "tracked" | "no-repo" | "unknown";
