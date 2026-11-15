import type { CodecovService } from "./rest.js";

/** The repository the plugin asks Codecov about. */
export interface CodecovTarget {
	/** The git hosting service Codecov knows the owner by. */
	service: CodecovService;
	/** The owner (user or organization) on that service. */
	owner: string;
	/** The repository name. */
	repo: string;
}

/** The options that say which repository to ask about. */
export interface CodecovTargetOptions {
	/** The git hosting service. Default `github`. */
	service?: CodecovService;
	/** The owner. Default: the owner of `repo` when it is `owner/name`, else the active `org`. */
	owner?: string;
	/** The repository: `owner/name`, or a bare name. The CLI passes the repo it is operating on. */
	repo?: string;
	/** The active org, which the CLI passes to every plugin. */
	org?: string;
}

/** Works out the repository from the plugin options, or `undefined` when they do not name one. */
export function resolveTarget(options: CodecovTargetOptions): CodecovTarget | undefined {
	const [first, second] = (options.repo ?? "").split("/");
	const name = second === undefined ? first : second;
	const owner = options.owner ?? (second === undefined ? undefined : first) ?? options.org;
	if (!owner || !name) return undefined;
	return { service: options.service ?? "github", owner, repo: name };
}

/** `owner/repo`, for messages. */
export function describeTarget(target: CodecovTarget): string {
	return `${target.owner}/${target.repo}`;
}
