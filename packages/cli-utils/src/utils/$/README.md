# $

Interact with the file system or run commands.

## Usage

```javascript
import { $ } from "@/utils";

async function main() {
	const hasBrew = await $.command("brew");
	if (hasBrew) {
		const [err, data] = await $("brew install test");

		if (err) {
			console.error("Error:", err);
			process.exit(1);
		}

		console.log(data);
	}
}

main();
```

## API

### `$(command: string)`

Run a shell command. Returns a Promise that will resolve to either an error or the standard output.

#### command

The shell command to run.

Type: `string`

### `.command(command: string)`

Checks whether a bash command exists. Returns a promise resolving to true if the command is installed, false otherwise.

#### command

The shell command to check.

Type: `string`

### `.directory(path: string, maxDepth: number)`

Returns a Promise that will resolve to a tuple with either an error, or an object with `files` and the `path`.

#### path

The path to the file.

Type: `string`

#### maxDepth

The maximum levels of directories to look through.

Type: `number`
Default: `Infinity`

### `.file(path: string, content: string | Buffer, overwrite: boolean)`

Returns a Promise that will resolve to a tuple with either an error, or an object with `content` and the `path`.

#### path

The path to the file.

Type: `string`

#### content

The contents of the file to write or append.

Type: `string | Buffer`

#### overwrite

Whether to append to the file or overwrite them completely.

Type: `boolean`
Default: `false`
