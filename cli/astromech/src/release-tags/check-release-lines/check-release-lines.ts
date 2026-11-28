import { compareVersions, parseVersion } from "../compare-versions/index.js";
import type {
	CheckReleaseLinesInput,
	PackageBehind,
	ReleaseLine,
	ReleaseTagCheck,
	ReleaseTagState,
} from "../release-tags.type.js";

/** The newest tag of each channel of a line. */
function newestTags(line: ReleaseLine, tags: CheckReleaseLinesInput["tags"]) {
	const newest = new Map<string, { distTag: string; tag: string; version: string; createdAt?: number }>();
	for (const { name, createdAt } of tags) {
		if (!name.startsWith(line.tagPrefix)) continue;
		const version = name.slice(line.tagPrefix.length);
		const parsed = parseVersion(version);
		if (!parsed) continue;
		// A stable release publishes to `latest`, a prerelease to its first identifier (`alpha`).
		const distTag = parsed.pre.length === 0 ? "latest" : parsed.pre[0];
		const current = newest.get(distTag);
		if (current && compareVersions(current.version, version) >= 0) continue;
		newest.set(distTag, { distTag, tag: name, version, ...(createdAt === undefined ? {} : { createdAt }) });
	}
	return [...newest.values()];
}

/**
 * Compares each release line's newest tag, per channel, with what npm serves on that channel's dist-tag.
 *
 * semantic-release pushes its tag (and the `refs/notes/semantic-release-<tag>` note) before it publishes, so a publish
 * that fails leaves a tag npm never received, and every later run sees the tag, finds nothing new and ends green. A
 * package that serves an older version than the tag, or none at all, is behind. A line with no tag has nothing to
 * check and gives no entry. A tag newer than `graceSeconds` is `pending`, because its own release may still be
 * publishing. Pure: tags and npm's answers come in as data.
 */
export function checkReleaseLines(input: CheckReleaseLinesInput): ReleaseTagCheck[] {
	const grace = input.graceSeconds ?? 0;
	const checks: ReleaseTagCheck[] = [];
	for (const line of input.lines) {
		for (const { distTag, tag, version, createdAt } of newestTags(line, input.tags)) {
			const behind: PackageBehind[] = [];
			for (const name of line.packages) {
				const onNpm = input.npm.get(name)?.[distTag];
				if (onNpm === undefined || compareVersions(onNpm, version) < 0) behind.push({ name, onNpm });
			}
			const fresh =
				grace > 0 && input.now !== undefined && createdAt !== undefined && input.now - createdAt < grace;
			const state: ReleaseTagState = behind.length === 0 ? "published" : fresh ? "pending" : "wedged";
			checks.push({ line: line.id, distTag, tag, version, state, behind });
		}
	}
	return checks;
}
