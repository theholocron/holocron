import os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const __cmddir = (dir: string) => path.resolve(__dirname, dir);
export const HOME = os.homedir();
export const OS = process.platform;
export const SYSTEM_IGNORED_FOLDERS = [
	"Applications",
	"Library",
	"Movies",
	"Music",
	"Pictures",
	"Public",
	"Users",
] as const;
export type IgnoredFolders = (typeof SYSTEM_IGNORED_FOLDERS)[number];
