import yargs, { type Argv } from "yargs";

/**
 * Runs one command module through a real yargs parse, so a test covers the command's builder and its handler together.
 * `configure` declares the root options the real CLI has (`--cwd`, `--dry-run`, …) before the command is added. A handler
 * that throws reaches the test as a rejection, not as a message printed by yargs. The handler's collaborators are mocked
 * by the test.
 */
export async function runCommand(
	module: unknown,
	args: string[],
	configure: (parser: Argv) => Argv = (parser) => parser
): Promise<Record<string, unknown>> {
	return configure(yargs(args).parserConfiguration({ "populate--": true }))
		.command(module as never)
		.fail((msg, err) => {
			throw err ?? new Error(msg);
		})
		.parseAsync();
}
