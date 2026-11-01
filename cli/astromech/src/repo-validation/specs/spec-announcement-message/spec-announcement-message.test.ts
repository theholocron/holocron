import { describe, expect, it } from "vitest";

import type { SpecAnnouncement } from "../specs.type.js";
import { specAnnouncementMessage } from "./spec-announcement-message.js";

const PR = { number: 1536, url: "https://github.com/theholocron/holocron/pull/1536" };
const a = (over: Partial<SpecAnnouncement>): SpecAnnouncement => ({
	path: ".notes/x.spec.md",
	title: "Channel content",
	kind: "new",
	status: "proposed",
	...over,
});

describe("specAnnouncementMessage", () => {
	it("says each kind on a line of its own, then the pull request in angle brackets", () => {
		const message = specAnnouncementMessage(
			[
				a({ kind: "new" }),
				a({ kind: "edited", title: "Doctor" }),
				a({ kind: "status", title: "Relay", previousStatus: "draft", status: "proposed" }),
				a({ kind: "merged", title: "Sentinel", status: "accepted" }),
			],
			PR
		);

		expect(message).toBe(
			[
				"💡 New spec: **Channel content** (proposed)",
				"📝 Spec updated: **Doctor** (proposed)",
				"🔀 Spec status: **Relay**, draft → proposed",
				"✅ Spec merged: **Sentinel** (accepted)",
				"Pull request #1536: <https://github.com/theholocron/holocron/pull/1536>",
			].join("\n")
		);
	});

	it("leaves out a status the spec does not have", () => {
		const message = specAnnouncementMessage(
			[a({ kind: "new" }), a({ kind: "merged" })].map(({ status: _s, ...rest }) => rest),
			PR
		);

		expect(message).toContain("💡 New spec: **Channel content**\n");
		expect(message).toContain("✅ Spec merged: **Channel content**\n");
	});

	it("names a status change from or to no status", () => {
		const gone = specAnnouncementMessage(
			[{ ...a({ kind: "status", previousStatus: "draft" }), status: undefined }],
			PR
		);
		const added = specAnnouncementMessage([a({ kind: "status" })], PR);

		expect(gone).toContain("draft → no status");
		expect(added).toContain("no status → proposed");
	});
});
