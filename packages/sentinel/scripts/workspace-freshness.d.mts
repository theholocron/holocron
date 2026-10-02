/** See `workspace-freshness.mjs`. */
export function staleWorkspaceDeps(input: {
	deps: { name: string; version: string; dir: string }[];
	git: (args: string[]) => { status: number | null; stdout: string };
}): string[];
