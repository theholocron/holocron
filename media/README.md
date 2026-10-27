# Media

The following is a storage place for all of the media used within `holocron`.

## What's Available

### MP3s

- error.mp3 - used for when a command errs, and the `--sound` flag is enabled
- warning.mp3 - used for when a command has a warning, and the `--sound` flag is enabled
- success.mp3 - used for when a command is successful, and the `--sound` flag is enabled

### Images

- checkly-avatar.png - Checkly's own icon (the one its Slack and Discord alerts use), on the webhook Checkly posts through in #uptime (`feeds.monitoring.avatar` in `holocron.config.ts`); kept here so `setup` does not depend on a third-party host being reachable
- webhook-avatar.png - the picture every Discord webhook wears (`webhookAvatar` in `holocron.config.ts`); the org avatar, as a 512px PNG because Discord does not take WebP
