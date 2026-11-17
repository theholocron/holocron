/**
 * The secret that holds a heartbeat's ping URL: `HOLOCRON_HEARTBEAT_<NAME>`, the name upper-snake-cased
 * (`check-tokens` is `HOLOCRON_HEARTBEAT_CHECK_TOKENS`). A name with nothing a variable name can carry is `undefined`.
 */
export function heartbeatSecretName(name: string): string | undefined {
	const snake = name
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/[^A-Za-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toUpperCase();
	return snake === "" ? undefined : `HOLOCRON_HEARTBEAT_${snake}`;
}
