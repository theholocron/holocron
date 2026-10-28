import yargs from "yargs";

/**
 * Runs one command module through a real yargs parse, with the root options `cli.ts` declares, so a test covers the
 * command's builder and its handler together. The handler's collaborators are mocked by the test.
 */
export async function runCommand(
	module: unknown,
	args: string[],
	root: { cwd?: string } = {}
): Promise<Record<string, unknown>> {
	return (
		yargs(args)
			.parserConfiguration({ "populate--": true })
			.option("cwd", { type: "string", default: root.cwd ?? "/repo" })
			.option("dry-run", { type: "boolean", default: false })
			.option("skip-dry-run", { type: "boolean", default: false })
			.option("token", { type: "string", array: true })
			.option("org", { type: "string" })
			.option("verbose", { type: "boolean", default: false })
			.option("debug", { type: "boolean", default: false })
			.option("quiet", { type: "boolean", default: false })
			.option("log", { type: "string" })
			.command(module as never)
			// A handler that throws should reach the test as a rejection, not be printed by yargs.
			.fail((msg, err) => {
				throw err ?? new Error(msg);
			})
			.parseAsync()
	);
}
