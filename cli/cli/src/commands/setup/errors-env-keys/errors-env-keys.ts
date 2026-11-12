import { KNOWN_STACK_DEPS } from "../derived-properties/index.js";

/**
 * The env keys `holocron setup` pushes a tracker's DSN under: the
 * provider's `envKeys` (always), then the `frameworkEnvKeys` of every
 * framework in the repo's detected `stack`; a repeated key is pushed once.
 * `unknown` lists the `frameworkEnvKeys` names that are not a known stack name
 * (a typo in a plugin), whose keys are never pushed, so the caller can say so.
 */
export function errorsEnvKeys(
	described: { envKeys: string[]; frameworkEnvKeys?: Record<string, string[] | undefined> },
	stack: readonly string[]
): { keys: string[]; unknown: string[] } {
	const extra = stack.flatMap((framework) => described.frameworkEnvKeys?.[framework] ?? []);
	const known: readonly string[] = KNOWN_STACK_DEPS;
	const unknown = Object.keys(described.frameworkEnvKeys ?? {}).filter((name) => !known.includes(name));
	return { keys: [...new Set([...described.envKeys, ...extra])], unknown };
}
