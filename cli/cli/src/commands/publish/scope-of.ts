import type { WorkspaceScope } from "./workspace-scope.type.js";

/** The {@link WorkspaceScope} a publish input asks for; unset options stay unset. */
export function scopeOf({ group, excludeGroups }: WorkspaceScope): WorkspaceScope {
	return {
		...(group === undefined ? {} : { group }),
		...(excludeGroups === undefined ? {} : { excludeGroups }),
	};
}
