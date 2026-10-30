/** The group of a workspace folder: its top-level directory, or `root`. */
export function groupOf(dir: string): string {
	return dir.split("/")[0] || "root";
}
