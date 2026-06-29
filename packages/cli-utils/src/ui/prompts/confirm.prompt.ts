import { confirm } from "@inquirer/prompts";

type Callback = () => void | Promise<void>;

export async function confirmPrompt(
	message: string,
	callback: Callback,
	error: Callback = () => {
		/* noOp */
	}
): Promise<void> {
	const should = await confirm({
		message,
	});

	if (should) {
		await callback();
	} else {
		await error();
	}
}
