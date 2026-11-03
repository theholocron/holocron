/** The facts about a repo that decide what its scripts call. */
export interface RepoShape {
	/**
	 * `true` for a workspace whose `turbo.json` is generated (holocron, the monorepo templates): its root scripts call
	 * `turbo run` directly, because the `holocron` bin may not exist yet on a fresh clone and turbo is an ordinary
	 * devDependency. `false` for a single package, whose scripts call `holocron run`.
	 */
	monorepo: boolean;
}
