import { describe, expect, it } from "vitest";

import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { formatDoctorPost } from "./format-doctor-post.js";

const check = (over: Partial<NotificationsCheck>): NotificationsCheck => ({
	id: "x",
	title: "a step",
	status: "pass",
	detail: "fine",
	problems: [],
	...over,
});

describe("formatDoctorPost", () => {
	it("is only the summary when every step held, with no step listed", () => {
		const out = formatDoctorPost({
			checks: [check({}), check({ status: "skip", title: "skipped step" })],
			summary: { pass: 25, fail: 0, skip: 1 },
		});
		expect(out).toBe("### ✅ `holocron doctor notifications`\n**25** ok · **0** fail · **1** skipped");
	});

	it("lists each failing step with its problems, and leaves out the ones that held or were skipped", () => {
		const out = formatDoctorPost({
			checks: [
				check({}),
				check({
					status: "fail",
					title: "pinned messages in place",
					detail: "1 problem(s)",
					problems: ["#rules differs"],
				}),
				check({ status: "fail", title: "server owned by a person", detail: "no owner", problems: [] }),
				check({ status: "skip", title: "skipped step" }),
			],
			summary: { pass: 1, fail: 2, skip: 1 },
		});
		expect(out).toBe(
			[
				"### ❌ `holocron doctor notifications`",
				"**1** ok · **2** fail · **1** skipped",
				"",
				"**pinned messages in place** — 1 problem(s)",
				"- #rules differs",
				"",
				"**server owned by a person** — no owner",
			].join("\n")
		);
	});

	it("flattens control characters in what a provider said", () => {
		const out = formatDoctorPost({
			checks: [check({ status: "fail", detail: "a\nb\u001b[2J", problems: ["c\nd"] })],
			summary: { pass: 0, fail: 1, skip: 0 },
		});
		expect(out.includes("\u001b")).toBe(false);
		expect(out.split("\n")).toHaveLength(5);
	});

	it("cuts a message that would not fit in one post", () => {
		const checks = Array.from({ length: 40 }, (_, i) =>
			check({ status: "fail", title: `step ${i}`, detail: "x".repeat(150) })
		);
		const out = formatDoctorPost({ checks, summary: { pass: 0, fail: 40, skip: 0 } });
		expect(out.length).toBeLessThanOrEqual(1910);
		expect(out.endsWith("\n…")).toBe(true);
	});
});
