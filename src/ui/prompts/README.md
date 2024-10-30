# Prompts

Inquirer prompts

## Usage

```javascript
import { prompt } from "@/ui";

async function main() {
	const [, , project] = process.argv;

	try {
		const filepath = await prompt.search(project, undefined, undefined, {});
		console.log(filepath);
	}
	catch (error) {
		console.error("Error:", error);
	}
}

main();
```

## API

### `project(message?: string)`

Returns a string of the directory selected.

#### message

The message to display to the user.

Type: `string`
Default: "Enter a project:"
