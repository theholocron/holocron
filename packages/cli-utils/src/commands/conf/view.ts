import type { CommandBuilder } from "yargs";
import { CLIOptions } from "@/cli";
import { config, log, str } from "@/utils";

interface ViewConfOpts extends CLIOptions {
	name?: string[];
}

export const builder: CommandBuilder<ViewConfOpts, ViewConfOpts> = (yargs) =>
	yargs.positional("name", {
		coerce: str.toArray,
		describe: "Any key within the configuration file",
		type: "string",
	});
export const command: string = "view [name..]";
export const desc: string = "View the configuration";
export function handler(options: ViewConfOpts): Record<string, any> | Record<string, any>[] {
	const FN = "conf.view";
	log.data(FN, "arguments", options, options);

	const { name } = options;

	if (name && name.length > 0) {
		const items = name.reduce(
			(acc, item) => {
				acc[item] = config.get(item);
				return acc;
			},
			{} as Record<string, any>
		);

		console.log(items);
		return items;
	}

	const allConfig = config.get();
	const obj = { ...allConfig };
	console.log(obj);
	return obj;
}
