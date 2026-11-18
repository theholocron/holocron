/**
 * What to do about a tag npm never received, one line per step. semantic-release's tag and its note
 * (`refs/notes/semantic-release-<tag>`) both have to go: with the note left behind it still counts the release as
 * done. The two known causes are named so the log need not be read: a sigstore 409 (the tarball is identical to a
 * published one, so the change needs different contents) and `ENEEDAUTH` (the Trusted Publisher entries expired, so
 * `holocron publish package --sync-trust` registers them again).
 */
export function wedgeFix(tag: string): string[] {
	return [
		`delete the tag: git push --delete origin ${tag}`,
		`delete its note: git push origin :refs/notes/semantic-release-${tag}`,
		"cause 1, a sigstore 409 on an identical tarball: the next release needs different contents",
		"cause 2, ENEEDAUTH: the Trusted Publisher entries expired; run holocron publish package --sync-trust",
	];
}
