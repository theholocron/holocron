# Tasks

A set of functions designed to be strung together to create actions. An API of sorts, to power the command-line client.

## What's Available

-   [find](./find/README.md) - find things
-   [replace](./replace/README.md) - replace things

## Rules

A set of rules for how I decide when to create a task, as opposed to creating an action.

### A single responsibility

It should only have a single responsibility. It shouldn't interact with the user in any sort of decision tree (no interaction with `inquirer`). Testing this through the provided examples should allow for a few inputs with some expected outputs. For example:

-   I clone a project; I get a clone somewhere
-   I search a folder; I get the location of that folder
-   I search a project; I get the location of that project
-   I create a directory; I get a directory somewhere

In the case of actions, these are where I may ask it do several things while having it interact with the user. This also means that the return type is typically consistent; meaning it will be an array of consistent types, etc. If you have forks in your code that change the type from say a string to a number you might need to split them up into separate tasks.

### Return type

It should return in the form of <code>[null | Error, null | data, null | duration]</code>. Tasks returns data; actions return process error codes or voids or logs.

### Other rules

-   Tasks are designed to be used to compose an action; this means the output of one task will be input for another
-   Tasks are atomic; as close to bare metal Node processes as possible
-   Most of the arguments in the function should be required unless where sensible defaults make sense
