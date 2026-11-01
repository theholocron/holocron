/** Whether any subject is a Conventional Commit `feat`: `feat:`, `feat(scope):` or `feat!:`, in any case. */
export function isFeat(subjects: readonly string[]): boolean {
	return subjects.some((s) => /^feat(\([^)]*\))?!?:/i.test(s.trim()));
}
