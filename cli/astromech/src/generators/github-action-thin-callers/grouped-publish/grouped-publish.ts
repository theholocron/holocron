import { reusableWorkflowRef } from "../../ci-ref/index.js";
import { yamlScalar } from "./yaml-scalar.js";

/** The reusable's inputs a group may set for itself; everything else is shared by all releases. */
const GROUP_INPUTS = ["deploy-on-release", "post-release", "run-build", "sentry-project"] as const;

/** Same rule as `groupReleaseConfig()`: the name is a tag prefix and a folder. */
const GROUP_NAME = /^[a-z][a-z0-9-]*$/;

/** Names the `group` choice already uses. */
const RESERVED = ["all", "ungrouped"];

type Inputs = Record<string, string | boolean>;
type Entry = { group: string } & Inputs;

/** Validate a group's (or the ungrouped release's) own inputs. */
function parseInputs(label: string, inputs: Record<string, unknown>): Inputs {
	for (const [key, value] of Object.entries(inputs)) {
		if (!(GROUP_INPUTS as readonly string[]).includes(key)) {
			throw new TypeError(
				`delivery.publish: ${label} sets "${key}", which is not per-release; use one of ${GROUP_INPUTS.join(", ")}`
			);
		}
		if (typeof value !== "string" && typeof value !== "boolean") {
			throw new TypeError(`delivery.publish: ${label} input "${key}" must be a string or a boolean`);
		}
	}
	return inputs as Inputs;
}

/**
 * Validate a `delivery.publish` `groups` list and flatten it to matrix entries.
 * A group is its folder name, or `{ name, ...inputs }` to set some of the reusable's
 * inputs for that group alone (`sentry-project` and `deploy-on-release` belong to one
 * release, not to every release in the matrix).
 */
function parseGroups(groups: unknown): Entry[] {
	if (!Array.isArray(groups) || groups.length === 0) {
		throw new TypeError("delivery.publish: `groups` must be a non-empty list of version-group folders");
	}
	const seen = new Set<string>();
	return groups.map((raw: unknown): Entry => {
		const { name, ...inputs } =
			typeof raw === "string" ? { name: raw } : ((raw ?? {}) as Record<string, unknown> & { name?: unknown });
		if (typeof name !== "string" || !GROUP_NAME.test(name) || RESERVED.includes(name)) {
			throw new TypeError(
				`delivery.publish: a group is a lowercase folder name like "clients" (not ${RESERVED.map((r) => `"${r}"`).join(" or ")}), got ${JSON.stringify(name)}`
			);
		}
		if (seen.has(name)) throw new TypeError(`delivery.publish: group "${name}" is listed twice`);
		seen.add(name);
		return { group: name, ...parseInputs(`group "${name}"`, inputs) };
	});
}

/**
 * The `delivery.publish` thin caller for a repo that releases several version groups:
 * a `plan` job picks the groups, and a matrix job calls the reusable workflow once per
 * group. `base` is the plain caller template; its triggers, permissions and concurrency
 * are kept, and its `jobs:` replaced.
 *
 * - Groups release **one at a time** (`max-parallel: 1`): each release pushes a commit to
 *   the branch, and the next group's run checks out the branch tip (see the reusable's
 *   `group` input). `fail-fast` is off so one group's failure does not skip the rest.
 * - A push releases every group; a manual run can pick one (and dry-run it) with the
 *   `group` input. A job's `if:` cannot see `matrix`, so the choice is made in `plan`.
 * - `ungrouped` also releases everything that is in **no** group, together and under the
 *   repo's plain tags, as the single release did before; it runs **last**, from the branch's
 *   current tip (`from-branch-tip`), once every group has released. Packages in no group
 *   depend on the groups' packages through `workspace:` ranges, which are rewritten to
 *   concrete versions at publish time, so the groups must be on npm first; list `groups` in
 *   dependency order (a group before the groups that depend on it). It is skipped if a group
 *   failed, so a failed dependency does not leave a package published against a version
 *   that is not on npm. It takes the same per-release inputs as a group (`true` for none).
 *   A repo with groups and packages in no group needs it, or those packages would stop
 *   releasing.
 * - `shared` entries (and the template's own `dry-run`) go to every release; the
 *   per-group inputs come from the matrix entry.
 */
export function groupedPublishCaller(
	base: string,
	groups: unknown,
	shared: Record<string, unknown>,
	ungrouped: unknown = false
): string {
	const entries = parseGroups(groups);
	const ungroupedInputs =
		ungrouped === true
			? {}
			: ungrouped && typeof ungrouped === "object" && !Array.isArray(ungrouped)
				? parseInputs("`ungrouped`", ungrouped as Record<string, unknown>)
				: undefined;
	if (ungrouped !== false && ungrouped !== undefined && ungroupedInputs === undefined) {
		throw new TypeError("delivery.publish: `ungrouped` must be true, or an object of per-release inputs");
	}

	const perGroup = GROUP_INPUTS.filter((key) => entries.some((entry) => key in entry));
	const clash = [...perGroup, ...Object.keys(ungroupedInputs ?? {})].filter((key) => key in shared);
	if (clash.length > 0) {
		throw new TypeError(
			`delivery.publish: ${[...new Set(clash)].join(", ")} is set both for every release and for one`
		);
	}

	const groupInput = [
		"      group:",
		"        description: >",
		"          Release one version group instead of all of them. Push-triggered",
		"          runs always release everything.",
		"        required: false",
		"        default: all",
		"        type: choice",
		"        options:",
		"          - all",
		...(ungroupedInputs ? ["          - ungrouped"] : []),
		...entries.map((entry) => `          - ${entry.group}`),
		"",
	].join("\n");

	const head = base
		.slice(0, base.indexOf("jobs:\n"))
		// the first `type: boolean` is the template's `dry_run` input
		.replace(/( {8}type: boolean\n)/, `$1${groupInput}`);

	// the plain caller template always has a `with:` block; if it ever stops, this fails rather than guesses
	const templateWith = base
		.match(/ {4}with:\n((?: {6}[^\n]+\n)*)/)![1]!
		.split("\n")
		.filter(Boolean);
	const sharedWith = Object.entries(shared).map(([key, value]) => `      ${key}: ${yamlScalar(value)}`);

	const matrixWith = [
		...templateWith,
		"      group: ${{ matrix.group }}",
		...sharedWith,
		...perGroup.map((key) => {
			const boolean = entries.every((entry) => !(key in entry) || typeof entry[key] === "boolean");
			return `      ${key}: \${{ matrix.${key}${boolean ? " == true" : ""} }}`;
		}),
	];

	const matrixJson = JSON.stringify(entries).replaceAll("'", "''");
	const uses = `    uses: ${reusableWorkflowRef("delivery.publish.yml")}`;

	const ungroupedJob = ungroupedInputs
		? [
				"  release:",
				"    name: Release",
				"    # last: the packages in no group depend on the groups' packages, which must be on npm first.",
				"    # Runs even if the groups were skipped (a manual run picked `ungrouped`), but not if one failed.",
				"    needs: [plan, release-groups]",
				"    if: >-",
				"      ${{ !cancelled() && needs.plan.result == 'success' && needs.release-groups.result != 'failure' &&",
				"      (inputs.group == '' || inputs.group == 'all' || inputs.group == 'ungrouped') }}",
				uses,
				"    with:",
				...templateWith,
				"      from-branch-tip: true",
				...sharedWith,
				...Object.entries(ungroupedInputs).map(([key, value]) => `      ${key}: ${yamlScalar(value)}`),
				"    secrets: inherit",
			]
		: [];

	return [
		`${head}jobs:`,
		"  plan:",
		"    name: Plan",
		"    runs-on: ubuntu-latest",
		"    permissions: {}",
		"    outputs:",
		"      groups: ${{ steps.plan.outputs.groups }}",
		"    steps:",
		"      - id: plan",
		"        name: Choose the groups to release",
		"        env:",
		"          GROUP: ${{ inputs.group }}",
		`          ALL_GROUPS: '${matrixJson}'`,
		"        run: |",
		'          if [ -n "$GROUP" ] && [ "$GROUP" != "all" ]; then',
		`            groups=$(jq -c --arg group "$GROUP" '[.[] | select(.group == $group)]' <<<"$ALL_GROUPS")`,
		"          else",
		"            groups=$ALL_GROUPS",
		"          fi",
		'          echo "groups=$groups" >> "$GITHUB_OUTPUT"',
		"",
		`  ${ungroupedInputs ? "release-groups" : "release"}:`,
		"    name: Release ${{ matrix.group }}",
		...(ungroupedInputs
			? [
					"    # Choosing `ungrouped` by hand leaves the plan empty, and a matrix with no entries fails the run.",
					"    needs: plan",
					"    if: ${{ needs.plan.outputs.groups != '[]' }}",
				]
			: ["    needs: plan"]),
		"    strategy:",
		"      fail-fast: false",
		"      max-parallel: 1",
		"      matrix:",
		"        include: ${{ fromJSON(needs.plan.outputs.groups) }}",
		uses,
		"    with:",
		...matrixWith,
		"    secrets: inherit",
		...(ungroupedJob.length > 0 ? ["", ...ungroupedJob] : []),
		"",
	].join("\n");
}
