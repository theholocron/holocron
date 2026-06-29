import { HOME } from "@/const";
import { find } from "@/tasks";

async function main() {
	const [, , folder] = process.argv;

	try {
		const [err, data] = await find(folder, HOME, {});

		if (err) {
			console.error(err);
			process.exit(1);
		}

		console.log("Folders Found:\n");
		console.table(data);
	} catch (error) {
		console.error("An error occurred:", error);
		process.exit(1);
	}
}

main();
