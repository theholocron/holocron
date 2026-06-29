import { HOME } from "@/const";
import { find } from "@/tasks";

const filePaths = [
	`${HOME}/Code/disney/solo/apps/commerce/src/common/context/__browser-mocks__/handlers.ts`,
	`${HOME}/Code/disney/solo/packages/developer-experience/sdk-session/src/tests/handlers.ts`,
	`${HOME}/Code/disney/solo/packages/instrumentation/src/glimpse/hooks/use-fire-fed-purchase-event.test.tsx`,
];
const baseString: string = "const BAM_BROWSER_SDK_VERSION =";

async function main() {
	const [, , version] = process.argv;
	const [major, minor] = version.split(".");

	try {
		const [err, data, duration] = await find.replace(filePaths, baseString, `${major}.${minor}`);

		if (err) {
			console.error("Error:", err);
			process.exit(1);
		}

		console.log("Files replaced:\n");
		console.table(data);
		console.log(`It took ${duration} milliseconds`);
	} catch (error) {
		console.error("Error:", error);
	}
}

main();
