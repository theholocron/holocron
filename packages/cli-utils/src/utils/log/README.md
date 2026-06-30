# Log

A logger with different levels and formatting options.

This provides functions for logging messages with different log levels (error, info, success, warning). Each log level has its own formatting for better readability.

## Usage

```javascript
import { log } from "@/utils";

const FN = "func";
const options = { debug: true };

console.log(log.style.bold("this message is bold"));

log.data(FN, "key", { test: "value"}, options);
log.error(FN, "This is an error message", options);
log.info(FN, "This is an info message", options);
log.process(FN, "this is a processing message", options);
log.success(FN, "This is a success message", options);
log.warning(FN, "This is a warning message", options);
```

## API

All functions take `CLIOptions` as the last argument, which allow you to pass in an object with `debug` as a boolean to allow you to print to the console and `sound` as a boolean to allow sound as feedback.

### `.data(prefix: string, key: string, message: any, options: CLIOptions)`

Logs data with a function prefix.

#### prefix

The function name to be identified in the logs.

Type: `string`

#### key

A name for the data.

Type: `string`

#### message

Type: `any`

### `.error(prefix: string, message: string)`

Logs an error message with a function prefix.

#### prefix

The function name to be identified in the logs.

Type: `string`

#### message

Type: `string`

### `.info(prefix: string, message: string)`

Logs an info message with a function prefix.

#### prefix

The function name to be identified in the logs.

Type: `string`

#### message

Type: `string`

### `.process(prefix: string, message: string)`

Logs a message for a running process with a function prefix.

#### prefix

The function name to be identified in the logs.

Type: `string`

#### message

Type: `string`

### `.success(prefix: string, message: string)`

Logs a success message with a function prefix.

#### prefix

The function name to be identified in the logs.

Type: `string`

#### message

Type: `string`

### `.warning(prefix: string, message: string)`

Logs a warning message with a function prefix.

#### prefix

The function name to be identified in the logs.

Type: `string`

#### message

Type: `string`
