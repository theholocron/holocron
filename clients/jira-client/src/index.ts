import { issues } from "./issues.js";
import { links } from "./links.js";
import { projects } from "./projects.js";
import { transitions } from "./transitions.js";
import { versions } from "./versions.js";

export type * from "./types.js";
export type { IssueLinkResult } from "./links.js";

export type { issues, links, projects, transitions, versions };

export function createJiraClient(options: { host: string; token: string }) {
	return {
		issues: issues(options),
		links: links(options),
		projects: projects(options),
		transitions: transitions(options),
		versions: versions(options),
	};
}
