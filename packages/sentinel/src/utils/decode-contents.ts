/** Base64-decode `GitContents.content` — GitHub's Contents API's only supported encoding. Shared by every module here that reads a file from a repo's default branch. */
export function decodeContents(content: string): string {
	return Buffer.from(content, "base64").toString("utf8");
}
