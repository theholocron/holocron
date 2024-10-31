import { HOME, SYSTEM_IGNORED_FOLDERS, type IgnoredFolders } from "@/const";
import { config } from "../config";

/**
 * Expands the tilde (~) in a path to the user's home directory.
 */
export function expandTilde(pathname: string): string {
	const tilde = "~";

	if (pathname.startsWith(tilde)) {
		return pathname.replace(tilde, HOME);
	}

	return pathname;
}

export const isHidden = (pathname: string): boolean => pathname.startsWith(".");

export const isIgnored = (pathname: string): boolean =>
	SYSTEM_IGNORED_FOLDERS.includes(pathname as IgnoredFolders) ||
	config.get("preferences.ignoredFolders").includes(pathname);
