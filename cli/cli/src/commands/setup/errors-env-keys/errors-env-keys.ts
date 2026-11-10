/**
 * The env keys `holocron repo setup` pushes a tracker's DSN under: the
 * provider's `envKeys` (always), then the `frameworkEnvKeys` of every
 * framework in the repo's detected `stack`. A framework the stack lacks, or a
 * key the provider does not know, adds nothing; a repeated key is pushed once.
 */
export function errorsEnvKeys(
	described: { envKeys: string[]; frameworkEnvKeys?: Record<string, string[]> },
	stack: readonly string[]
): string[] {
	const extra = stack.flatMap((framework) => described.frameworkEnvKeys?.[framework] ?? []);
	return [...new Set([...described.envKeys, ...extra])];
}
