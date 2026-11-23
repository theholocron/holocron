import { postedUpdateIds } from "../incident-markers/index.js";
import type { IncidentFeedPlan, PlanIncidentFeedInput } from "./plan-incident-feed.type.js";

/**
 * What a run does for one incident (spec `tech-incidents-to-discord`): make the post if there is none, append each
 * update whose marker is not in the post, rewrite the summary, title and tag when the incident changed, and close the
 * post once it is resolved (or open it again when a resolved incident is reopened). Pure: a rerun with nothing new plans
 * nothing. An update already posted is never rewritten, even when its text was edited on the page; only the summary,
 * which is rebuilt from the current data, follows an edit.
 */
export function planIncidentFeed(input: PlanIncidentFeedInput): IncidentFeedPlan {
	const { incident, rendered, post, messages } = input;
	const resolved = incident.status === "resolved";
	if (!post) {
		const steps = ["create post", ...incident.updates.map((u) => `append update ${u.id}`)];
		if (resolved) steps.push("close");
		return {
			id: incident.id,
			create: true,
			rewrite: false,
			append: [...incident.updates],
			...(resolved ? { close: true } : {}),
			steps,
		};
	}
	const posted = postedUpdateIds(messages);
	const append = incident.updates.filter((u) => !posted.has(u.id));
	const first = messages.at(-1);
	const summaryChanged = first === undefined || !first.startsWith(rendered.body.trimEnd());
	const rewrite = append.length > 0 || summaryChanged || post.title !== rendered.title;
	const retag = post.state !== rendered.tag ? rendered.tag : undefined;
	const close = resolved && !post.closed ? true : !resolved && post.closed ? false : undefined;
	const steps = [
		...(rewrite ? ["rewrite summary"] : []),
		...append.map((u) => `append update ${u.id}`),
		...(retag ? [`retag ${retag}`] : []),
		...(close === true ? ["close"] : close === false ? ["reopen"] : []),
	];
	return {
		id: incident.id,
		create: false,
		rewrite,
		append,
		...(retag ? { retag } : {}),
		...(close !== undefined ? { close } : {}),
		steps,
	};
}
