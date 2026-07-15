# Find a Folder

Find a folder recursively.

## Usage

```javascript
import { findFolder } from "@/tasks";

async function main() {
	const [, , folder] = process.argv;

	try {
		const [err, data] = await findFolder(folder);

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
```

## API

### `findFolder(folder: string, location?: string)`

Returns an array of file paths that were found.

#### folder

The folder with which to search.

Type: `string`

#### location

The directory path to where to search for the folder.

Type: `string`
Default: `os.homedir()`
