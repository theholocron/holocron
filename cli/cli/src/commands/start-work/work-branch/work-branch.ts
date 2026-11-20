/**
 * What names an issue in a branch: its number for `#12`, `12` and `owner/repo#12`, the lower-cased key for a
 * tracker's own (`ENG-42` is `eng-42`). `undefined` for a key with nothing usable in it.
 */
export function issueRef(key: string): string | undefined {
	const trimmed = key.trim();
	const number = /^(?:[^#\s]+#|#)?(\d+)$/.exec(trimmed);
	if (number) return number[1];
	const own = trimmed.toLowerCase();
	return /^[a-z][a-z0-9]*-\d+$/.test(own) ? own : undefined;
}

/** The branch of a piece of work, `<type>/<issue>-<slug>` (`feat/2429-work-commands`); `undefined` when the key has no usable form. */
export function workBranchName(type: string, key: string, slug: string): string | undefined {
	const ref = issueRef(key);
	return ref ? `${type}/${ref}-${slug}` : undefined;
}
