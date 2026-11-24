import { describe, expect, it } from "vitest";

import { pickStatusPage } from "./pick-status-page.js";

const page = (name: string) => ({ name, slug: name, components: [] });

describe("pickStatusPage", () => {
	it("takes the only declared page by default and a named one when there are several", () => {
		expect(pickStatusPage([page("A")])).toEqual({ page: page("A") });
		expect(pickStatusPage([page("A"), page("B")], "B")).toEqual({ page: page("B") });
	});

	it("says why there is no page to pick", () => {
		expect(pickStatusPage([])).toEqual({
			problem: "no status page is declared in the monitoring provider's `statusPages`",
		});
		expect(pickStatusPage([page("A")], "Z")).toEqual({ problem: 'no status page named "Z" (declared: A)' });
		expect(pickStatusPage([page("A"), page("B")])).toEqual({
			problem: "2 status pages are declared; name one with --page (A, B)",
		});
	});
});
