# Open an Application

Open an application after a confirmation.

## Usage

```javascript
import { open } from "@/ui";

async function main () {
	const [, , name, location] = process.argv;

	try {
		const [err, isOpened] = await open.editor(name, location);

		if (err) {
			console.error(err);
			process.exit(1);
		}

		console.log(`${name} ${isOpened ? "was" : "was not"} opened.`);
	}
	catch (error) {
		console.error('An error occurred:', error);
		process.exit(1);
	}
}

main();
```

## API

### `editor(name: string, location: string)`

Returns a Promise that resolves to a boolean.

#### name

A name of the application.

Type: `string`

#### location

A path of where the application is located.

Type: `string`

### `browser(url: string)`

Opens the URL in the users default browser.

#### url

The URL to open.

Type: `string`
