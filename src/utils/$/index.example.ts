import { $ } from "./index";

async function main() {
	const isFile = await $.file("./README.md");
	const isNotAFile = await $.file("./");
	const isResolvedFile = await $.file("~/Downloads/chevron-down.tsx");
	console.log({
		isFile,
		isNotAFile,
		isResolvedFile,
	});

	const isDirectory = await $.directory("./");
	const isNotADirectory = await $.directory("./README.md");
	const isResolvedDirectory = await $.directory("~/Downloads");
	const isCreatedDirectory = await $.directory("./test");
	console.log({
		isDirectory,
		isNotADirectory,
		isResolvedDirectory,
		isCreatedDirectory,
	});

	const [err, output, time] = await $("ls .");
	if (err) {
		console.error("Error executing command:", err);
	} else {
		console.log("Command output:", output);
		console.log("Execution time:", time, "ms");
	}

	// Checking if a command is installed
	const isBrewInstalled = await $.command("brew");
	console.log("Is brew installed?", isBrewInstalled);
}

main();
