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

/** How the templates spell a reference. Never emitted as it is, and never to be changed: {@link rehome} reads it. */
export const TEMPLATE_HOME: CiHome = {
	workflows: "theholocron/.github/.github/workflows",
	actions: "theholocron/.github/.github/actions",
	ref: "main",
};

/**
 * Where generated workflows call the hosted files today. No change from the templates' own spelling until the files
 * move (#1475, #1480); the target is `theholocron/holocron/.github/workflows` and `theholocron/holocron/ci/actions` at
 * `ci-v1`.
 */
export const CI_HOME: CiHome = { ...TEMPLATE_HOME };

const REFERENCE = /theholocron\/\.github\/\.github\/(workflows|actions)\/([\w.-]+)@main/g;

/** `text` with every hosted-workflow and hosted-action reference moved from the templates' spelling to `home`. */
export function rehome(text: string, home: CiHome = CI_HOME): string {
	return text.replace(
		REFERENCE,
		(_all, kind: "workflows" | "actions", name: string) => `${home[kind]}/${name}@${home.ref}`
	);
}

/** {@link rehome} applied to every value of a map of templates. */
export function rehomeAll<T extends Record<string, string>>(templates: T, home: CiHome = CI_HOME): T {
	return Object.fromEntries(Object.entries(templates).map(([name, text]) => [name, rehome(text, home)])) as T;
}

/** A `uses:` value for a hosted reusable workflow, for generated YAML that is not written in a template. */
export function reusableWorkflowRef(file: string, home: CiHome = CI_HOME): string {
	return `${home.workflows}/${file}@${home.ref}`;
}
