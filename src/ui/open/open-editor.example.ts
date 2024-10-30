import { open } from "@/ui";

async function main() {
	const [, , name, location] = process.argv;

	try {
		await open.editor(name, location);
	} catch (error) {
		console.error("An error occurred:", error);
		process.exit(1);
	}
}

main();
