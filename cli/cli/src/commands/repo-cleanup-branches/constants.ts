import { RELEASE_BRANCHES } from "@theholocron/astromech";

/** The long-lived branches: never deleted, and what a branch must be an ancestor of (as `origin/<name>`) to count as merged. These are the release branches. */
export const BASE_BRANCHES = RELEASE_BRANCHES;
