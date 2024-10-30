# Environment Variables

A wrapper around [`dotenv`](https://github.com/motdotla/dotenv) that provides a configuration file for storing environment variables.

The configuration will pull from a `.env` file within the repository and place all of that data onto the `process.env` for instant access.

## Usage

```javascript
import { env } from "@/utils";

// grab every value within the configuration file
const [readErr, readData] = env.read();

// grab a specific variable
const [readAllErr, readAllData] = env.read("SOME_ENV_VAR");

// set a specific variable
const [writeErr, writeData] = env.write({ mockKey: "mockValue" });
```

### When to use `env` methods or `process.env`

#### Use `process.env` for accessing environment variables

The point of `dotenv` is to allow you to put environment variables within a file in order to have them show up on `process.env`.  So if you need access to any environment variable, rather than running it on the command-line, you can add it to the `.env` and it will be present.

#### Use `env.read()` for interfacing with the configuration file

Whenever you want the application to read the configuration file or values on it, then use `env.read()`. Common use cases would be to read the configuration before changing it, or reading the values to use it for setting something else such as a file name.

#### Use `env.write()` for writing to or updating the configuration file

Whenever you want the application to change the configuration file or values on it, then use `env.write()`.  This will set permanent changes to the configuration file.

## API

### `.read(key?: string)`

Returns the value of the key specified or the entire environment variables object if no key is present.

#### key

Type: `string`

### `.write(obj: Record<string, string>)`

Returns `true` if writing to the environment variables file was successful, or `false` if there was an error.

#### obj

Type: `Record<string, string>`
