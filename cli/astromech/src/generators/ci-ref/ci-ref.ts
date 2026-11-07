import { flatFile, legacyFile } from "../../vocabulary/index.js";
/**
 * Where the reusable workflows and composite actions that every generated workflow calls are hosted, and at which ref.
 * This is the only place that says so: the templates are written against the spelling in {@link TEMPLATE_HOME}, and
 * {@link rehome} rewrites it to {@link CI_HOME} once, where the template maps are built. Moving the home is a change
 * to {@link CI_HOME} alone (spec `tech-workflows-in-holocron`, issue #1474).
 */

/** The base path of a hosted workflow or action, without its name: `<owner>/<repo>/<dir>`, and the ref to run it at. */
export interface CiHome {
	/** Base of the reusable workflows; a name and `.yml` follow. */
	workflows: string;
	/** Base of the composite actions; a name follows. */
	actions: string;
	/** The git ref every reference is pinned to. */
	ref: string;
}

/**
 * The org slug a CLI user gets when no config names one. Where a resolved config is in reach, `config.org` is the
 * source and this is only the fallback; a command with no config (`new repo`, `sync github`, `publish --sync-trust`)
 * uses it as it is.
 */
export const DEFAULT_ORG = "theholocron";

/** The `owner/repo` of the org's `.github` repo, which hosts the frozen reusable workflows (and Sentinel's dispatch target). */
export const DOT_GITHUB_REPO = `${DEFAULT_ORG}/.github`;

/** The `owner/repo` of this monorepo, where the CLI, the reusables' sources and the Trusted Publisher config live. */
export const HOLOCRON_REPO = `${DEFAULT_ORG}/holocron`;

/** How the templates spell a reference. Never emitted as it is, and never to be changed: {@link rehome} reads it. */
export const TEMPLATE_HOME: CiHome = {
	workflows: `${DOT_GITHUB_REPO}/.github/workflows`,
	actions: `${DOT_GITHUB_REPO}/.github/actions`,
	ref: "main",
};

/**
 * Where generated workflows call the hosted files today. No change from the templates' own spelling until the files
 * move (#1475, #1480); the target is `theholocron/holocron/.github/workflows` and `theholocron/holocron/ci/actions` at
 * `ci-v1`.
 */
export const CI_HOME: CiHome = { ...TEMPLATE_HOME };

/**
 * Where the hosted files will live once `ci-v1` exists, and where a frozen copy in `theholocron/.github` tells its
 * users to go. Not used to generate anything yet: {@link CI_HOME} follows when the tag does.
 */
export const CI_TARGET: CiHome = {
	workflows: `${HOLOCRON_REPO}/.github/workflows`,
	actions: `${HOLOCRON_REPO}/ci/actions`,
	ref: "ci-v1",
};

/**
 * The file name a reference to the reusable `file` (flat, as the templates spell it) has at `home`. The frozen copies
 * that `main` of `theholocron/.github` serves have the old names, so a `main` home gets the old name; `ci-v1` has only
 * flat ones.
 */
function fileAt(file: string, home: CiHome): string {
	return legacyGate(home) ? legacyFile(file) : file;
}

/**
 * Whether a caller that calls its reusables at `home` keeps the names it had before they became the task id (the
 * legacy-name gate): while 'home' is the frozen copies on `main`, the callers of a repo other than the one that hosts
 * the reusables keep their old workflow, job and file names, because their rulesets list the checks those post. `ci-v1`
 * has only flat names, so the gate is open there and every caller is flat (spec `ci-flat-task-vocabulary`, phase K).
 */
export function legacyGate(home: CiHome = CI_HOME): boolean {
	return home.ref === "main";
}

const REFERENCE = /theholocron\/\.github\/\.github\/(workflows|actions)\/([\w.-]+)@main/g;

/** `text` with every hosted-workflow and hosted-action reference moved from the templates' spelling to `home`. */
export function rehome(text: string, home: CiHome = CI_HOME): string {
	return text.replace(
		REFERENCE,
		(_all, kind: "workflows" | "actions", name: string) =>
			`${home[kind]}/${kind === "workflows" ? fileAt(name, home) : name}@${home.ref}`
	);
}

/** {@link rehome} applied to every value of a map of templates. */
export function rehomeAll<T extends Record<string, string>>(templates: T, home: CiHome = CI_HOME): T {
	return Object.fromEntries(Object.entries(templates).map(([name, text]) => [name, rehome(text, home)])) as T;
}

/**
 * A `uses:` value for a hosted reusable workflow, for generated YAML that is not written in a template. `file` is the
 * flat name (`deploy.yml`); at a `main` home it is spelled with the old one.
 */
export function reusableWorkflowRef(file: string, home: CiHome = CI_HOME): string {
	return `${home.workflows}/${fileAt(file, home)}@${home.ref}`;
}

/**
 * `text` with every reference to a hosted reusable workflow at `home` rewritten to the file in the same checkout
 * (`./.github/workflows/<name>.yml`, always the flat name, whichever spelling the reference had). For the repo that hosts the reusables: its own callers then run the reusable at
 * their own commit, so a PR that edits one exercises it. Composite actions are left on their full ref, because a
 * reusable called from another repository cannot see this checkout.
 */
export function localize(text: string, home: CiHome = CI_HOME): string {
	const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const reference = new RegExp(`${escaped(home.workflows)}/([\\w.-]+)@${escaped(home.ref)}`, "g");
	return text.replace(reference, (_all, name: string) => `./.github/workflows/${flatFile(name)}`);
}
