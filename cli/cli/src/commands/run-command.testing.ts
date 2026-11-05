import { addGlobalOptions } from "@theholocron/kyber/flags";
import { runCommand as runCommandWith } from "@theholocron/kyber/testing";

/**
 * Runs one command module through a real yargs parse, with the root options `cli.ts` declares, so a test covers the
 * command's builder and its handler together. The handler's collaborators are mocked by the test.
 */
export async function runCommand(
	module: unknown,
	args: string[],
	root: { cwd?: string } = {}
): Promise<Record<string, unknown>> {
	return runCommandWith(module, args, (parser) =>
		addGlobalOptions(parser, { cwd: root.cwd ?? "/repo" })
			.option("skip-dry-run", { type: "boolean", default: false })
			.option("org", { type: "string" })
			.option("verbose", { type: "boolean", default: false })
			.option("debug", { type: "boolean", default: false })
			.option("quiet", { type: "boolean", default: false })
			.option("log", { type: "string" })
	);
}
