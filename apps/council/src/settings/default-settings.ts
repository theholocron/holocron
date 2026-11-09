import type { IdeasSettings } from "./settings.type.js";

/** The settings a fresh install starts with; they match the defaults of the `ideas` block in `holocron.config`. */
export const DEFAULT_SETTINGS: IdeasSettings = {
	repoPath: "",
	command: "pnpm exec holocron",
	states: "seed, exploring, in-progress, dropped",
	fileState: "in-progress",
};
