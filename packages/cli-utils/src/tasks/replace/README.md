# Find & Replace

Find a string in a file and replace it with something else.

## Usage

```javascript
import { findReplace } from "@/tasks";

const filePaths = [
	`/packages/developer-experience/sdk-session/src/tests/handlers.ts`,
];
const baseString: string = "const BAM_BROWSER_SDK_VERSION =";

async function main() {
	const [, , version] = process.argv;
	const [major, minor] = version.split(".");

	try {
		const [err, data, duration] = await findReplace(filePaths, baseString, `${major}.${minor}`);

		if (err) {
			console.error("Error:", err);
			process.exit(1);
		}

		console.log("Files replaced:\n");
		console.table(data);
		console.log(`It took ${duration} milliseconds`);
	}
	catch (error) {
		console.error("Error:", error);
	}
}

main();
```

## API

### `findReplace(filePaths: string[], searchTerm: string, replacement: string)`

Returns an array of file paths that were modified.

#### filePaths

The file paths with which to search.

Type: `string[]`

#### searchTerm

The search term to look for and replace.

Type: `string`

#### replacement

A string to replace with

Type: `string`
