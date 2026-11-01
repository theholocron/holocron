import {
	describeSpecChange,
	type SpecAnnouncement,
	specAnnouncementMessage,
	type SpecChangeEvent,
} from "@theholocron/astromech/repo-validation";

import type { Probe } from "../../../plugin/index.js";
import type { SpecsAnnounceIo } from "./specs.type.js";

const EVENTS: readonly string[] = ["opened", "updated", "merged"];

/**
 * `specs announce`: decides whether a pull request event on a spec is worth a post, and writes the post as the step
 * outputs `post` (`true` or `false`) and `message`, for the `notify` action to send to #ideas. It posts nothing itself.
 * The event is `SPEC_EVENT` (`opened`, `updated` or `merged`), the files are compared between `BEFORE_SHA` and
 * `AFTER_SHA`, and `PR_NUMBER` and `PR_URL` say which pull request it is. The rules are `describeSpecChange` and
 * `specAnnouncementMessage` in `@theholocron/astromech/repo-validation`. Never fails: a missing input or an
 * unreadable revision is reported and means no post.
 */
export function specsAnnounceProbe(io: SpecsAnnounceIo): Probe {
	return {
		summary:
			"Write the #ideas post for a pull request that opens, updates or merges a spec (posts nothing itself).",
		writes: false,
		async run(ctx) {
			const { SPEC_EVENT: event, BEFORE_SHA: before, AFTER_SHA: after, PR_NUMBER, PR_URL: url } = io.env;
			const number = Number(PR_NUMBER);
			ctx.say({ status: "heading", label: "Spec announcement" });
			const skip = (detail: string): void => {
				io.setOutput("post", "false");
				ctx.say({ status: "info", label: "announcement", detail });
			};
			if (
				!event ||
				!EVENTS.includes(event) ||
				!before ||
				!after ||
				!Number.isInteger(number) ||
				!url?.startsWith("https://")
			) {
				return skip(
					"skipped: needs SPEC_EVENT (opened, updated or merged), BEFORE_SHA, AFTER_SHA, PR_NUMBER and an https PR_URL"
				);
			}

			let paths: string[];
			try {
				paths = io.changedFiles(before, after);
			} catch {
				return skip("could not determine the changed files; skipped");
			}
			const announcements = paths.flatMap((path): SpecAnnouncement[] => {
				const found = describeSpecChange({
					event: event as SpecChangeEvent,
					path,
					before: io.readAt(before, path),
					after: io.readAt(after, path),
				});
				return found ? [found] : [];
			});
			if (announcements.length === 0) return skip("no spec to announce");

			for (const a of announcements) ctx.say({ status: "ok", label: a.path, detail: `${a.kind}: ${a.title}` });
			io.setOutput("post", "true");
			io.setOutput("message", specAnnouncementMessage(announcements, { number, url }));
		},
	};
}
