const LEVELS = ["read", "write", "admin"];

/** The permissions in `want` that `have` lacks or holds at a lower level (`read < write < admin`), one line each. */
export function permissionGaps(want: Record<string, string>, have: Record<string, string>): string[] {
	return Object.entries(want).flatMap(([name, level]) => {
		const held = have[name];
		if (held === undefined) return [`missing permission ${name} (${level})`];
		return LEVELS.indexOf(held) < LEVELS.indexOf(level) ? [`permission ${name} is ${held}, wants ${level}`] : [];
	});
}
