import { yamlScalar } from "./yaml-scalar.js";

/** The reusable's inputs a group may set for itself; everything else is shared by all groups. */
const GROUP_INPUTS = ["deploy-on-release", "post-release", "run-build", "sentry-project"] as const;

/** Same rule as `groupReleaseConfig()`: the name is a tag prefix and a folder. */
const GROUP_NAME = /^[a-z][a-z0-9-]*$/;

type Entry = { group: string } & Record<string, string | boolean>;

/**
 * Validate a `delivery.publish` `groups` list and flatten it to matrix entries.
 * A group is its folder name, or `{ name, ...inputs }` to set some of the reusable's
 * inputs for that group alone (`sentry-project` and `deploy-on-release` belong to one
 * group, not to every release in the matrix).
 */
function parseGroups(groups: unknown): Entry[] {
	if (!Array.isArray(groups) || groups.length === 0) {
		throw new TypeError("delivery.publish: `groups` must be a non-empty list of version-group folders");
	}
	const seen = new Set<string>();
	return groups.map((raw: unknown): Entry => {
		const { name, ...inputs } =
			typeof raw === "string" ? { name: raw } : ((raw ?? {}) as Record<string, unknown> & { name?: unknown });
		if (typeof name !== "string" || !GROUP_NAME.test(name)) {
			throw new TypeError(
				`delivery.publish: a group is a lowercase folder name like "clients", got ${JSON.stringify(name)}`
			);
		}
		if (seen.has(name)) throw new TypeError(`delivery.publish: group "${name}" is listed twice`);
		seen.add(name);
		for (const [key, value] of Object.entries(inputs)) {
			if (!(GROUP_INPUTS as readonly string[]).includes(key)) {
				throw new TypeError(
					`delivery.publish: group "${name}" sets "${key}", which is not per-group; use one of ${GROUP_INPUTS.join(", ")}`
				);
			}
			if (typeof value !== "string" && typeof value !== "boolean") {
				throw new TypeError(`delivery.publish: group "${name}" input "${key}" must be a string or a boolean`);
			}
		}
		return { group: name, ...(inputs as Record<string, string | boolean>) };
	});
}

/**
 * The `delivery.publish` thin caller for a repo that releases several version groups:
 * a `plan` job picks the groups, and `release` calls the reusable workflow once per group
 * from a matrix. `base` is the plain caller template; its triggers, permissions and
 * concurrency are kept, and its `jobs:` replaced.
 *
 * - Groups release **one at a time** (`max-parallel: 1`): each release pushes a commit to
 *   the branch, and the next group's run checks out the branch tip (see the reusable's
 *   `group` input). `fail-fast` is off so one group's failure does not skip the rest.
 * - A push releases every group; a manual run can pick one (and dry-run it) with the
 *   `group` input. A job's `if:` cannot see `matrix`, so the choice is made in `plan`.
 * - `shared` entries (and the template's own `dry-run`) go to every group; the
 *   per-group inputs come from the matrix entry.
 */
export function groupedPublishCaller(base: string, groups: unknown, shared: Record<string, unknown>): string {
	const entries = parseGroups(groups);

	const perGroup = GROUP_INPUTS.filter((key) => entries.some((entry) => key in entry));
	const clash = perGroup.filter((key) => key in shared);
	if (clash.length > 0) {
		throw new TypeError(`delivery.publish: ${clash.join(", ")} is set both for every group and for a group`);
	}

	const groupInput = [
		"      group:",
		"        description: >",
		"          Release one version group instead of all of them. Push-triggered",
		"          runs always release every group.",
		"        required: false",
		"        default: all",
		"        type: choice",
		"        options:",
		"          - all",
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
	const withLines = [
		...templateWith,
		"      group: ${{ matrix.group }}",
		...Object.entries(shared).map(([key, value]) => `      ${key}: ${yamlScalar(value)}`),
		...perGroup.map((key) => {
			const boolean = entries.every((entry) => !(key in entry) || typeof entry[key] === "boolean");
			return `      ${key}: \${{ matrix.${key}${boolean ? " == true" : ""} }}`;
		}),
	];

	const matrixJson = JSON.stringify(entries).replaceAll("'", "''");

	return `${head}jobs:
  plan:
    name: Plan
    runs-on: ubuntu-latest
    permissions: {}
    outputs:
      groups: \${{ steps.plan.outputs.groups }}
    steps:
      - id: plan
        name: Choose the groups to release
        env:
          GROUP: \${{ inputs.group }}
          ALL_GROUPS: '${matrixJson}'
        run: |
          if [ -n "$GROUP" ] && [ "$GROUP" != "all" ]; then
            groups=$(jq -c --arg group "$GROUP" '[.[] | select(.group == $group)]' <<<"$ALL_GROUPS")
          else
            groups=$ALL_GROUPS
          fi
          echo "groups=$groups" >> "$GITHUB_OUTPUT"

  release:
    name: Release \${{ matrix.group }}
    needs: plan
    strategy:
      fail-fast: false
      max-parallel: 1
      matrix:
        include: \${{ fromJSON(needs.plan.outputs.groups) }}
    uses: theholocron/.github/.github/workflows/delivery.publish.yml@main
    with:
${withLines.join("\n")}
    secrets: inherit
`;
}
