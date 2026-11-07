/**
 * The branches releases are cut from, in release order: `main` is the stable line, `alpha` the prerelease line.
 *
 * This is the release-branch LIST. It is not the repo's default branch (`defaultBranch` in `holocron.config.ts` is a
 * per-repo setting) and it is not the prerelease channel name (see {@link PRERELEASE_CHANNEL}).
 */
export const RELEASE_BRANCHES = ["main", "alpha"] as const;

/**
 * The prerelease channel: the branch name semantic-release publishes prereleases from, which is also the npm
 * dist-tag those prereleases carry. It is one of {@link RELEASE_BRANCHES}.
 */
export const PRERELEASE_CHANNEL = "alpha" as const;
