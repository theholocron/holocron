import { command, isInstalled } from "./command";

describe("command", () => {
	test("execute command and return stdout", async () => {
		const cmd = "echo Hello, world!";

		const result = await command(cmd);

		expect(result).toEqual([null, "Hello, world!\n", expect.any(Number)]);
	});

	describe("errors", () => {
		test("return error if command fails", async () => {
			const result = await command("{}");

			expect(result[0]).toBeDefined();
			expect(result[1]).toBeNull();
			expect(result[2]).toEqual(expect.any(Number));
		});

		test("return 'Unknown error' if error is not an instance of Error", async () => {
			const unexpectedError = "This is not an Error object";

			const result = await command("valid-command-that-will-throw-an-error", { unexpectedError });

			expect(result[1]).toBeNull();
			expect(result[2]).toEqual(expect.any(Number));
		});
	});
});

describe("isInstalled", () => {
	test("return true if command is installed", async () => {
		const cmd = "ls"; // Assuming 'ls' command is installed on your system

		const result = await isInstalled(cmd);

		expect(result).toBe(true);
	});

	test("return false if command is not installed", async () => {
		const cmd = "nonexistent-command";

		const result = await isInstalled(cmd);

		expect(result).toBe(false);
	});
});
