import type { CommandBuilder } from "yargs";
import { CLIOptions } from "@/cli";
import { config, log } from "@/utils";

interface AddConfOpts extends CLIOptions {
	name: string;
	value: any;
}

export const builder: CommandBuilder<AddConfOpts, AddConfOpts> = (yargs) =>
	yargs
		.positional("name", {
			demandOption: true,
			describe: "A key to store as within the configuration file",
			type: "string",
		})
		.positional("value", {
			demandOption: true,
			describe: "The value to store within the configuration file",
			type: "string",
		});
export const command: string = "add <name> <value>";
export const desc: string = "Add to the configuration";
export function handler(options: AddConfOpts): void {
	const FN = "conf add";
	log.data(FN, "arguments", options, options);

	const { name, value } = options;
	const conf = config.get(name);

	if (Array.isArray(conf)) {
		config.set(name, Array.from(new Set([...conf, value])));
		const obj = config.get(name);
		log.success(FN, obj);
		return obj;
	}

	if (Object.prototype.toString.call(conf) === "[object Object]") {
		config.set(name, { ...conf, ...value });
		const obj = config.get(name);
		log.success(FN, obj);
		return obj;
	}

	config.set(name, value);
	const obj = config.get(name);
	log.success(FN, obj);
	return obj;
}
