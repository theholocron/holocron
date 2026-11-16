/** The command Claude Code runs before every Bash call: the destructive command guard (`dcg`, on the PATH). */
export const DCG_COMMAND = "dcg";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a hook entry already runs `dcg`, with or without arguments (`dcg`, `dcg --strict`, a path ending in `/dcg`). */
function runsDcg(hook: unknown): boolean {
	if (!isObject(hook) || typeof hook.command !== "string") return false;
	// `split` always returns at least one piece, so the first is there even for an empty command.
	const program = hook.command.trim().split(/\s+/)[0]!;
	return program === DCG_COMMAND || program.endsWith(`/${DCG_COMMAND}`);
}

/**
 * `settings` with the `dcg` `PreToolUse` hook for Bash calls wired in, and everything else in it (permissions, other
 * hooks, other matchers) exactly as it was. Already wired, whatever the matcher entry looks like around it, is left
 * alone, so a second run changes nothing. Throws on a file whose shape cannot hold the hook (`hooks` or `PreToolUse`
 * that is not an object or a list), so a hand-edited file is never silently replaced.
 */
export function withDcgHook(settings: unknown): Json {
	if (!isObject(settings)) throw new Error("the settings file is not a JSON object");
	const hooks = settings.hooks ?? {};
	if (!isObject(hooks)) throw new Error("`hooks` in the settings file is not an object");
	const preToolUse = hooks.PreToolUse ?? [];
	if (!Array.isArray(preToolUse)) throw new Error("`hooks.PreToolUse` in the settings file is not a list");

	const wired = preToolUse.some(
		(entry) =>
			isObject(entry) && entry.matcher === "Bash" && Array.isArray(entry.hooks) && entry.hooks.some(runsDcg)
	);
	if (wired) return settings;

	return {
		...settings,
		hooks: {
			...hooks,
			PreToolUse: [...preToolUse, { matcher: "Bash", hooks: [{ type: "command", command: DCG_COMMAND }] }],
		},
	};
}
