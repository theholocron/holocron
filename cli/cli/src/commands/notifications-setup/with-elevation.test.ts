import { describe, expect, it } from "vitest";

import { ElevationRequiredError, type Notifications } from "../../plugin/index.js";
import { withElevation } from "./with-elevation.js";

/** A provider that holds nothing yet, and a person who presses Enter at once. */
const deps = () => ({
	label: "server settings",
	notifications: { providerName: "discord", holdsPermission: async () => false } as unknown as Notifications,
	pause: async () => {},
	print: () => {},
});

/** First attempt refused for a missing permission (kept, so there is no take-away to answer), the retry then throws `retry`. */
const refusedThen = (retry: unknown) => {
	let calls = 0;
	return async () => {
		if (calls++ === 0) {
			throw new ElevationRequiredError("refused", {
				permission: "Administrator",
				grantUrl: "https://grant",
				keep: true,
			});
		}
		throw retry;
	};
};

describe("withElevation, when the retry fails", () => {
	it("throws the error the retry threw, as it is", async () => {
		const failure = new Error("the retry failed");
		const err = await withElevation(refusedThen(failure), deps()).catch((e: unknown) => e);
		expect(err).toBe(failure);
	});

	it("wraps something that is not an Error, so what is thrown always is one", async () => {
		const err = await withElevation(refusedThen("a plain string"), deps()).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("a plain string");
	});
});
