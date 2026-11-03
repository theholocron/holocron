import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { waitForEnter } from "./wait-for-enter.js";

describe("waitForEnter", () => {
	it("prints the message and resolves once Enter is pressed", async () => {
		const input = new PassThrough();
		const output = new PassThrough();
		let printed = "";
		output.on("data", (chunk: Buffer) => (printed += chunk.toString()));
		const done = waitForEnter("Press Enter: ", input, output);
		input.write("\n");
		await done;
		expect(printed).toContain("Press Enter: ");
	});
});
