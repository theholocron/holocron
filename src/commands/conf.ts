import { type CommandBuilder } from "yargs";

interface ConfArgs {
	command: string;
}

export const builder: CommandBuilder<ConfArgs, ConfArgs> = (yargs) =>
	yargs.commandDir("conf", { extensions: ["js", "ts"] });
export const command: string = "conf <command>";
export const desc: string = "Interact with the configuration";
