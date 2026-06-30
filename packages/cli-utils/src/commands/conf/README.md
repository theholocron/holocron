# Configuration File

An action to interact with the configuration file.

## How Do I Use This?

Run the `--help` or `-h` command to find out how to use the command.

```sh
Usage: tsx ./src/cli.ts conf <command> [options]

Commands:
	tsx ./src/cli.ts conf add <key> <value> [options]
	tsx ./src/cli.ts conf edit [options]
	tsx ./src/cli.ts conf view [key] [options]

Examples:
	tsx ./src/cli.ts conf add 
	tsx ./src/cli.ts conf edit
	tsx ./src/cli.ts conf view
	tsx ./src/cli.ts conf view domains
```

All [global options](/README.md#options) are supported as well.

## API

### Return

If command is valid, it will exit with a `0` code and the file path. Otherwise, it will exit with `1` code and an error message.

### `add`

Adds a key-value pair to the configuration and returns the updated configuration.

### `edit`

Opens the configuration file in the default editor for editing.

### `view`

Retrieves and prints the configuration settings based on provided keys or all configurations if no keys are specified.

* `options:CLIOptions` - The options containing configuration details and the keys to be retrieved.
* @returns {Record<string, any> | Record<string, any>[]} - The requested configuration settings.
