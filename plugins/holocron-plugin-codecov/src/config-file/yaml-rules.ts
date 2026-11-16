/**
 * The rules that bring a `codecov.yml` in line with the repo's flags and components: pure text-to-text functions, so a
 * hand edit survives and a second run changes nothing. Moved from astromech's `generators/codecov` (#2238, step 3).
 */

import type { CoverageConfigDocumentation } from "@theholocron/cli";

import { DOCUMENTATION_FLAG } from "../capabilities/status-contexts.js";

export const INDIVIDUAL_COMPONENTS_MARKER = "  individual_components:";

/**
 * Ensure every codecov status default carries `if_not_found: success`, so an
 * infra-only PR (dep bump, config, lockfile — no coverable change) passes
 * instead of hanging forever on a required check codecov never posts.
 *
 * Injects the key on the line after each `target:` that sits inside a status
 * block (`coverage.status.*.default` or a `statuses:` list item — indent ≥ 8,
 * or ≥ 8 for a `- type:` list entry), when the immediate sibling lines do not
 * already declare it.
 */
export function ensureIfNotFound(yaml: string): string {
	const lines = yaml.split("\n");
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		out.push(line);
		const m = /^(\s{8,})target:\s+\S+\s*$/.exec(line);
		if (!m) continue;
		const indent = m[1]!;
		// Look at the sibling lines of this mapping (same indent, until it dedents).
		let alreadySet = false;
		for (let j = i + 1; j < lines.length; j++) {
			const sib = lines[j]!;
			if (sib.trim() === "") continue;
			const sibIndent = sib.match(/^\s*/)![0].length;
			if (sibIndent < indent.length) break;
			if (sibIndent === indent.length && /^\s*if_not_found\s*:/.test(sib)) {
				alreadySet = true;
				break;
			}
			if (
				sibIndent === indent.length &&
				/^\s*(- |\w)/.test(sib) &&
				!/^\s*(threshold|flags|paths|branches)\s*:/.test(sib)
			) {
				break;
			}
		}
		if (!alreadySet) out.push(`${indent}if_not_found: success`);
	}
	return out.join("\n");
}

/** `[start, end)` of a top-level key's section; trailing blank lines are not part of it. `null` when absent. */
function section(lines: string[], key: string): [number, number] | null {
	const start = lines.indexOf(`${key}:`);
	if (start === -1) return null;
	let end = lines.findIndex((line, i) => i > start && /^[A-Za-z_]/.test(line));
	if (end === -1) end = lines.length;
	while (lines[end - 1]!.trim() === "") end--;
	return [start, end];
}

/** Insert the entries of `wanted` that no existing list item names, after the list's last line (`listEnd`). */
function appendMissingItems(
	lines: string[],
	listStart: number,
	listEnd: number,
	wanted: string[],
	itemName: RegExp,
	render: (name: string) => string
): void {
	const have = new Set(lines.slice(listStart + 1, listEnd).map((line) => itemName.exec(line)?.[1]));
	lines.splice(listEnd, 0, ...wanted.filter((name) => !have.has(name)).map(render));
}

const FLAG_ENTRY = /^ {4}- name:\s*(\S+)/;
const flagEntry = (name: string) => `    - name: ${name}`;

/**
 * Ensure a top-level `flag_management:` section carries `default_rules.carryforward`
 * and one `individual_flags` entry per flag. A missing section is inserted before
 * `component_management:`; an existing one only gains the entries it lacks, so hand
 * edits (extra flags, per-flag `paths`/`statuses`, a different `carryforward`) survive.
 */
export function ensureFlagManagement(yaml: string, flags: string[]): string {
	const lines = yaml.split("\n");
	const listHead = flags.length === 0 ? "  individual_flags: []" : "  individual_flags:";
	const range = section(lines, "flag_management");
	if (!range) {
		const block = [
			"flag_management:",
			"  default_rules:",
			"    carryforward: true",
			listHead,
			...flags.map(flagEntry),
		];
		const at = lines.indexOf("component_management:");
		if (at === -1) lines.push("", ...block);
		else lines.splice(at, 0, ...block, "");
		return lines.join("\n");
	}
	const [start, end] = range;
	const list = lines.findIndex((line, i) => i > start && i < end && /^ {2}individual_flags:/.test(line));
	if (list === -1) {
		lines.splice(end, 0, listHead, ...flags.map(flagEntry));
	} else if (/\[\s*\]\s*$/.test(lines[list]!)) {
		if (flags.length > 0) lines.splice(list, 1, listHead, ...flags.map(flagEntry));
	} else {
		appendMissingItems(lines, list, end, flags, FLAG_ENTRY, flagEntry);
	}
	return lines.join("\n");
}

/**
 * Scope `coverage.status.project.default` and `coverage.status.patch.default` to
 * the flags, so the required `codecov/project` and `codecov/patch` contexts keep
 * their names while only counting the grouped (non-`docs`) coverage. A block that
 * already lists flags only gains the missing ones; an inline `flags: [...]` is left alone.
 */
export function scopeAggregateStatuses(yaml: string, flags: string[]): string {
	if (flags.length === 0) return yaml;
	const lines = yaml.split("\n");
	for (const kind of ["project", "patch"]) {
		const at = lines.indexOf(`    ${kind}:`);
		if (at === -1 || lines[at + 1] !== "      default:") continue;
		let end = at + 2;
		while (end < lines.length && /^ {8}/.test(lines[end]!)) end++;
		const flagsAt = lines.findIndex((line, i) => i >= at + 2 && i < end && /^ {8}flags:/.test(line));
		if (flagsAt === -1) {
			lines.splice(at + 2, 0, "        flags:", ...flags.map((name) => `          - ${name}`));
		} else if (!/^ {8}flags:\s*\S/.test(lines[flagsAt]!)) {
			let listEnd = flagsAt + 1;
			while (listEnd < end && /^ {10}- /.test(lines[listEnd]!)) listEnd++;
			appendMissingItems(lines, flagsAt, listEnd, flags, /^ {10}- (\S+)/, (name) => `          - ${name}`);
		}
	}
	return lines.join("\n");
}

/**
 * Make the per-component statuses (`component_management.default_rules.statuses`)
 * informational, so the ~70 `codecov/patch/<component>` contexts post but never block.
 */
export function ensureInformationalComponentStatuses(yaml: string): string {
	const lines = yaml.split("\n");
	const range = section(lines, "component_management");
	if (!range) return yaml;
	const stop = lines.indexOf(INDIVIDUAL_COMPONENTS_MARKER);
	const limit = stop === -1 ? range[1] : stop;
	const starts = lines.flatMap((line, i) => (i > range[0] && i < limit && /^ {6}- type:/.test(line) ? [i] : []));
	for (const first of starts.reverse()) {
		let last = first + 1;
		while (last < limit && /^ {8}\S/.test(lines[last]!)) last++;
		if (!lines.slice(first, last).some((line) => /^ {8}informational:/.test(line))) {
			lines.splice(last, 0, "        informational: true");
		}
	}
	return lines.join("\n");
}

/** Documentation Codecov would otherwise count as testable code, though nothing reports coverage for it. */
const IGNORED_DOCS = ["**/*.mdx"];

const ignoreEntry = (glob: string) => `  - "${glob}"`;

/**
 * Ensure a top-level `ignore:` list names the documentation files in {@link IGNORED_DOCS}. Without it a docs-only
 * PR that adds `.mdx` pages is judged to change testable files, posts no coverage and fails `codecov/patch` and
 * `codecov/project` ("Empty Upload", #1442). A missing list is inserted before `coverage:`; an existing one only
 * gains the entries it lacks, so hand-added globs survive.
 */
export function ensureIgnore(yaml: string): string {
	const lines = yaml.split("\n");
	const range = section(lines, "ignore");
	if (!range) {
		const block = ["ignore:", ...IGNORED_DOCS.map(ignoreEntry), ""];
		const at = lines.indexOf("coverage:");
		if (at === -1) {
			while (lines.at(-1) === "") lines.pop();
			lines.push("", ...block.slice(0, -1));
		} else lines.splice(at, 0, ...block);
		return lines.join("\n");
	}
	appendMissingItems(lines, range[0], range[1], IGNORED_DOCS, /^ {2}- ["']?([^"'\s]+)/, ignoreEntry);
	return lines.join("\n");
}

/** What each aggregate asks of the `documentation` flag: the patch must be fully documented, the project must not drop. */
const DOCUMENTATION_TARGETS = { project: "auto", patch: "100%" } as const;

function documentationStatus(kind: keyof typeof DOCUMENTATION_TARGETS, mode: CoverageConfigDocumentation): string[] {
	return [
		`      ${DOCUMENTATION_FLAG}:`,
		"        flags:",
		`          - ${DOCUMENTATION_FLAG}`,
		`        target: ${DOCUMENTATION_TARGETS[kind]}`,
		"        if_not_found: success",
		...(mode === "warn" ? ["        informational: true"] : []),
	];
}

/**
 * Ensure `codecov.yml` carries the `documentation` flag and a named `documentation` status under
 * `coverage.status.project` and `coverage.status.patch` (spec `tech-api-docs`). They are named statuses scoped to that
 * flag, so the required `codecov/project` and `codecov/patch` keep counting only the tests. `warn` makes them
 * informational and `required` does not; an existing status only has that line brought in line, so hand edits survive.
 * `off` adds nothing and leaves what is there alone: setup never deletes.
 */
export function ensureDocumentationCoverage(yaml: string, mode: CoverageConfigDocumentation): string {
	if (mode === "off") return yaml;
	const lines = ensureFlagManagement(yaml, [DOCUMENTATION_FLAG]).split("\n");
	for (const kind of ["project", "patch"] as const) {
		const at = lines.indexOf(`    ${kind}:`);
		if (at === -1) continue;
		// the status block ends at the next line that is not indented deeper than the kind, minus trailing blanks
		let end = at + 1;
		while (end < lines.length && (lines[end]!.trim() === "" || /^ {5}/.test(lines[end]!))) end++;
		while (lines[end - 1]!.trim() === "") end--;
		const own = lines.findIndex((line, i) => i > at && i < end && line === `      ${DOCUMENTATION_FLAG}:`);
		if (own === -1) {
			lines.splice(end, 0, ...documentationStatus(kind, mode));
			continue;
		}
		let ownEnd = own + 1;
		while (ownEnd < end && /^ {8}/.test(lines[ownEnd]!)) ownEnd++;
		const keep = lines.slice(own, ownEnd).filter((line) => !/^ {8}informational:/.test(line));
		lines.splice(own, ownEnd - own, ...keep, ...(mode === "warn" ? ["        informational: true"] : []));
	}
	return lines.join("\n");
}

/** Everything `codecov.yml` needs on top of the components list: if_not_found, ignored docs, flags, scoped aggregates, informational components, and the documentation flag when the repo asks for it. */
export function applyStatusRules(yaml: string, flags: string[], docsCoverage: CoverageConfigDocumentation): string {
	return ensureDocumentationCoverage(
		ensureInformationalComponentStatuses(
			scopeAggregateStatuses(ensureFlagManagement(ensureIgnore(ensureIfNotFound(yaml)), flags), flags)
		),
		docsCoverage
	);
}
