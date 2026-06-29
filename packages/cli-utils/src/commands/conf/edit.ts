import { type CLIOptions } from "@/cli";
import { open } from "@/ui";
import { config, log } from "@/utils";

export const command: string = "edit";
export const desc: string = "Edit the configuration";
export async function handler(options: CLIOptions): Promise<void> {
	const FN = "conf edit";
	log.data(FN, "arguments", options, options);

	await open.editor(config.path, undefined, true);
}
