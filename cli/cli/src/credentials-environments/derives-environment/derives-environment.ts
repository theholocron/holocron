/** The providers whose `credentials` entry may leave `environment` out and have it derived (#2063). */
const DERIVING = new Set(["1password"]);

/** Whether a `credentials` provider with no `environment` option derives its Environment names. */
export function derivesEnvironment(provider: string): boolean {
	return DERIVING.has(provider);
}
