# Google

Interact with Google Drive products, programmatically.

```javascript
import { node } from "@theholocron/client-google";

async function main () {
	const [, , sheetId] = process.argv;

	try {
		const [err, data] = await google.spreadsheets.get(sheetId);
		const [ firstSheet ] = data.sheets[0].data[0];
		const { rowData } = firstSheet.data[0];
		const [ header, ...rest ] = rowData;
		const output = rest.map(item => ({
			name: item.values[0].formattedValue,
			value: item.values[1].formattedValue
		}));

		if (err) {
			console.error("Error:", err);
			process.exit(1);
		}

		console.log(output);
	}
	catch (error) {
        console.error("An error occurred:", error);
        process.exit(1);
    }
}

main();
```

## API

### `.spreadsheets`

#### `.get(id: string)`

Grab data from a spreadsheet.

##### id

The ID of the spreadsheet.  Its in the URL.

Type: `string`

## How To…?

### Get a Token for OAuth2

To get the necessary information for setting up OAuth2 with Google APIs (like the client ID, client secret, and redirect URI), you need to go to the [Google Cloud Console](https://console.cloud.google.com/welcome?project=chewy-428805).

#### Create a New Project (if you don't have one already)

1. Click on the project dropdown at the top of the page.
2. Click on "New Project".
3. Give your project a name and click "Create".

#### Enable the API

1. Navigate to the "APIs & Services" section on the left-hand menu.
2. Click on "Library".
3. Search for the API you need (e.g., "Google Sheets API", "Google Drive API").
4. Click on the API and then click "Enable".

#### Create OAuth 2.0 Credentials

1. Go to the "APIs & Services" > "Credentials" page.
2. Click on "Create Credentials" and select "OAuth client ID".
3. If prompted to set up the OAuth consent screen, do so by providing the necessary information.
4. Once the consent screen is set up, select "Web application" as the application type.

#### Configure the OAuth Consent Screen

Set up the OAuth consent screen by providing the required information such as application name, support email, and developer contact information.

#### Create OAuth 2.0 Client ID

Under "Authorized redirect URIs", enter your redirect URI (e.g., http://localhost:4000/oauth2callback). Click "Create".

#### Get Client ID and Client Secret

After creating the credentials, you will see a dialog with your client ID and client secret. Copy these values and use them in your application code. Here’s what the settings look like in the console:

* Client ID: This will be a string similar to `<digits>.apps.googleusercontent.com`.
* Client Secret: This will be a string similar to `GOCSPX-<random-characters>`.
* Redirect URI: This should match the URI you specified in the console, such as `http://localhost:4000/oauth2callback`.

### Setup a Service Account for Authorization

Here’s a step-by-step guide to set up and use Service Account credentials in [Google Cloud Console](https://console.cloud.google.com/welcome?project=chewy-428805).

#### Create a Service Account

1. Select your project or create a new one.
2. Navigate to "IAM & Admin" > "Service Accounts".
3. Click "Create Service Account".
4. Provide a name and description for the Service Account, then click "Create".

#### Assign Roles to the Service Account

1. Select roles that grant the necessary permissions for the API you want to access. For example, to access Google Sheets, you might assign the "Editor" role.
2. Click "Continue" and then "Done".

#### Create and Download a Key

1. In the "Service Accounts" page, find the Service Account you created.
2. Click on the options menu (three dots) next to the Service Account and select "Manage keys".
3. Click "Add key" > "Create new key".
4. Select "JSON" and click "Create".
5. Download the JSON key file to your local machine.

### Resolve "The caller does not have permission" Error

#### Verify Permissions and Roles

Ensure that the service account has the appropriate roles assigned. For Google Sheets API, the service account needs at least the Editor role. For Google Drive API, it needs the Viewer, Commenter, or Editor role, depending on what actions you intend to perform.
You can assign roles in the Google Cloud Console IAM & Admin section.

#### Share the Resource with the Service Account

For Google Sheets, make sure the service account email is added as a collaborator with the necessary permissions (e.g., Viewer or Editor) on the specific Google Sheets file.
Similarly, for Google Drive, share the necessary files or folders with the service account email.

