/**
 * Runs `run` with `values` set in `process.env`, then puts every name back as it was (set again, or removed), even when
 * `run` throws. It is how a probe that reads another Environment sees that Environment's plain values ahead of the
 * machine's own: a plugin reads them through the usual chain, which looks at the process environment first, and the
 * overlay lives only for the one run. Nothing is written anywhere and the values are never printed.
 *
 * @param values - The variables to set for the run; none means `run` is called as it is.
 * @param run - The work that should see them.
 * @returns What `run` returns.
 */
export async function withEnvironmentValues<T>(
	values: Readonly<Record<string, string>> | undefined,
	run: () => Promise<T>
): Promise<T> {
	const names = Object.keys(values ?? {});
	if (!values || names.length === 0) return run();
	const before = new Map<string, string | undefined>(names.map((name) => [name, process.env[name]]));
	for (const name of names) process.env[name] = values[name]!;
	try {
		return await run();
	} finally {
		for (const [name, previous] of before) {
			if (previous === undefined) delete process.env[name];
			else process.env[name] = previous;
		}
	}
}
