import { type Return } from "@/types";
import { command, isInstalled } from "./command";
import { directory } from "./directory";
import { file } from "./file";
import { path } from "./path";
import { remove } from "./remove";
import { spwn } from "./spawn";

export { type Directory } from "./directory";
export { type File } from "./file";
export { getDirectoryByLevel } from "./directory";

export async function $(cmd: string, options: object = {}): Promise<Return<string>> {
	return await command(cmd, options);
}

$.command = isInstalled;
$.directory = directory;
$.file = file;
$.path = path;
$.remove = remove;
$.spawn = spwn;
