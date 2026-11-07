import { ConfigError } from "@theholocron/cli";

/** Linear's own names for the moments a git integration can move an issue. */
export const GIT_EVENTS = ["draft", "review", "start", "mergeable", "merge"] as const;

/** One of {@link GIT_EVENTS}. */
export type GitEvent = (typeof GIT_EVENTS)[number];

/** The team's git automation: when `event` happens the issue moves to `state` (a merge may name a target branch). */
export interface GitAutomationSetting {
	event: GitEvent;
	state: string;
	branch?: string;
}

/** What `provider linear setup` and `provider linear doctor` read from the issues provider entry. */
export interface LinearSetupConfig {
	/** The team key. */
	team: string;
	/** Months of inactivity after which an issue is closed, and the state it is put in (the team's default if left out). */
	autoClose?: { months: number; state?: string };
	/** Months after which a closed issue is archived. */
	autoArchive?: { months: number };
	/** Git automation. Validated, but not applied or compared yet. */
	git: GitAutomationSetting[];
	/** Label names to make on the team when missing. */
	labels: string[];
	/** The name of a project to make when missing. */
	project?: string;
}

/** The options as they arrive from `holocron.config`: nothing is trusted until {@link parseLinearSetup} has read it. */
export interface RawLinearSetup {
	team?: unknown;
	automation?: unknown;
	labels?: unknown;
	project?: unknown;
}

const ROOT = "providers.issues";

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim() === "") throw new ConfigError(`${path} must be a non-empty string`);
	return value;
}

function months(value: unknown, path: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new ConfigError(`${path} must be a non-negative integer (0 switches it off)`);
	}
	return value;
}

function section(parent: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
	const value = parent[key];
	if (value === undefined) return undefined;
	if (!isObject(value)) throw new ConfigError(`${ROOT}.automation.${key} must be an object`);
	return value;
}

function gitSetting(value: unknown, index: number): GitAutomationSetting {
	const path = `${ROOT}.automation.git[${index}]`;
	if (!isObject(value)) throw new ConfigError(`${path} must be an object`);
	const event = value.event;
	if (!GIT_EVENTS.includes(event as GitEvent)) {
		throw new ConfigError(`${path}.event must be one of ${GIT_EVENTS.join(", ")}`);
	}
	return {
		event: event as GitEvent,
		state: text(value.state, `${path}.state`),
		...(value.branch !== undefined ? { branch: text(value.branch, `${path}.branch`) } : {}),
	};
}

/**
 * Reads the Linear block of the issues provider entry: `team` (required), `automation.autoClose` / `autoArchive` /
 * `git`, `labels` and `project`. Anything of the wrong shape is a `ConfigError` naming the path.
 */
export function parseLinearSetup(raw: RawLinearSetup): LinearSetupConfig {
	const team = text(raw.team, `${ROOT}.team`);
	const config: LinearSetupConfig = { team, git: [], labels: [] };

	if (raw.automation !== undefined) {
		if (!isObject(raw.automation)) throw new ConfigError(`${ROOT}.automation must be an object`);
		const autoClose = section(raw.automation, "autoClose");
		if (autoClose) {
			config.autoClose = {
				months: months(autoClose.months, `${ROOT}.automation.autoClose.months`),
				...(autoClose.state !== undefined
					? { state: text(autoClose.state, `${ROOT}.automation.autoClose.state`) }
					: {}),
			};
		}
		const autoArchive = section(raw.automation, "autoArchive");
		if (autoArchive) {
			config.autoArchive = { months: months(autoArchive.months, `${ROOT}.automation.autoArchive.months`) };
		}
		const git = raw.automation.git;
		if (git !== undefined) {
			if (!Array.isArray(git)) throw new ConfigError(`${ROOT}.automation.git must be an array`);
			config.git = git.map(gitSetting);
		}
	}
	if (raw.labels !== undefined) {
		if (!Array.isArray(raw.labels)) throw new ConfigError(`${ROOT}.labels must be an array of names`);
		config.labels = [...new Set(raw.labels.map((name, i) => text(name, `${ROOT}.labels[${i}]`)))];
	}
	if (raw.project !== undefined) config.project = text(raw.project, `${ROOT}.project`);
	return config;
}

/** Whether the block declares anything for setup or the doctor to act on. */
export function declaresAnything(config: LinearSetupConfig): boolean {
	return Boolean(
		config.autoClose || config.autoArchive || config.git.length > 0 || config.labels.length > 0 || config.project
	);
}
