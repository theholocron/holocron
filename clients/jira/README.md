# Jira CLI

Interact with our internal Jira appliance from the command-line.

## Installation

```bash
npm install --save-dev @theholocron/cli-jira
```

## Table of Contents

* [Usage](#how-do-i-use-this)
* [Documentation](#documentation-)

## How Do I Use This?

Run the `--help` or `-h` command to find out how to use the command.

```sh
Usage: jira <command> [options]

Options:
  --verbose      Turn on the extra logging            [boolean] [default: false]
  -h, --help     Show help                                             [boolean]
  -v, --version  Show version number                                   [boolean]

Commands:
  jira link <command> [options]
  jira search <command> [options]
  jira ticket <command> [options]
  jira transition <command> [options]
  jira version <command> [options]

Examples:
  jira link create PL-1 PL-2
  jira link create PL-1 PL-2 --type="Duplicate"
  jira search 'application-example 2020.1.0'
  jira search 'application-example 2020.1.0' --project="PL" --subtasks
  jira ticket create "app has a bug" '{ "description": "follow these steps…" }' --project="PL" --type="Bug"
  jira ticket edit PL-1 '{ "description": "follow these steps to reproduce…" }'
  jira ticket get PL-1
  jira transition create PL-1 released
  jira transition get PL-1
  jira version create "app release 2020.1.0" '{ "description": "first release of 2020" }' --project="PL"
  jira version get 10000 --param="issuesstatus"
  jira version edit 1000 '{ "description": "second release of 2020" }'
  jira version delete 10000
  jira version archive 10000 '{ "description": "archiving releases of 2019" }'
  jira version release 10000 '{ "releaseDate": "2020-01-01" }'
```

### Token

This CLI uses Jira's [v2 API](https://developer.atlassian.com/cloud/jira/platform/rest/v2/) and requires a username and password in order to access anything on our GitHub appliance and it expects that to be exposed on the Node environment process.

`RP_JIRA_USERNAME` and `RP_JIRA_PASSWORD` is required for this to work on the command-line, so we recommend exposing them by putting them in your `.bashrc` or `.bash_profile` (e.g. `export RP_JIRA_USERNAME=<user>; export RP_JIRA_PASSWORD=<password>`).

You can also source this while running the command (e.g. `RP_JIRA_USERNAME=<username> RP_JIRA_PASSWORD=<password> jira <command>"`), but if you plan on running this more than once, its probably best to follow the above advice.

### Return

If command is valid, it will exit with a `0` code.  Otherwise, it will exit with `1` code and an error message.

## Documentation

Because of the complex nature of Jira and its API, this CLI has been broken down into sub-commands based on the groupings provided by Jira's [API documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v2/).  Each sub-command has its own documentation.

* [Link](./src/cmds/link/README.md) - create a link between two tickets
* [Search](./src/cmds/README.md) - search for anything on a Jira project board
* [Ticket](./src/cmds/ticket/README.md) - create a ticket, grab information from a ticket, or edit a ticket; anything that correlates to tickets according to [Jira's grouping](https://developer.atlassian.com/cloud/jira/platform/rest/v2/#api-group-Issues)
* [Version](./src/cmds/version/README.md) - create a version, grab information from a version, edit a version, delete a version, archive or release a version; anything that correlates to versions according to [Jira's grouping](https://developer.atlassian.com/cloud/jira/platform/rest/v2/#api-group-Project-versions)
