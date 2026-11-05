import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { waitForEnter } from "./wait-for-enter.js";

const streams = () => {
	const input = new PassThrough();
	const output = new PassThrough();
	let printed = "";
	output.on("data", (chunk: Buffer) => (printed += chunk.toString()));
	return { input, output, printed: () => printed };
};

/** Whether the promise has settled yet, after the event loop has had a turn. */
const settled = async (promise: Promise<unknown>) => {
	let done = false;
	void promise.then(() => (done = true));
	await new Promise((resolve) => setTimeout(resolve, 20));
	return done;
};

describe("waitForEnter", () => {
	it("prints the message, stays pending until Enter, then resolves `enter`", async () => {
		const { input, output, printed } = streams();
		const wait = waitForEnter("Press Enter: ", input, output);
		expect(await settled(wait)).toBe(false);
		input.write("\n");
		expect(await wait).toBe("enter");
		expect(printed()).toContain("Press Enter: ");
	});

	it("resolves `closed`, and does not hang, when the input ends before Enter", async () => {
		const { input, output } = streams();
		const wait = waitForEnter("Press Enter: ", input, output);
		expect(await settled(wait)).toBe(false);
		input.end();
		expect(await wait).toBe("closed");
	});

	it("resolves `closed` on Ctrl-C", async () => {
		const { input, output } = streams();
		const wait = waitForEnter("Press Enter: ", input, output);
		input.write("\u0003");
		// Without a terminal readline does not read Ctrl-C as a key, so end the input the way a closed terminal would.
		input.end();
		expect(await wait).toBe("closed");
	});
});
