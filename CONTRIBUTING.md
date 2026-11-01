# Contributing to Bob

Thanks for helping. A few house rules:

- **Opt-in is the standard.** Anything that starts by itself, sends data off the PC, downloads something
  or costs money must be off by default and turned on by the user.
- **Plain words in the app.** Buttons and settings say what they do. Bob's personality belongs in his chat
  replies, not in the menus.
- **Tests.** Run `npm test` before you open a pull request. It needs Node.js 20 or newer and nothing else.
  New behaviour gets a test.
- **No personal data.** Never commit `config.json`, anything from an `inn` folder, real paths from your
  PC, e-mail addresses or keys. `npm test` checks for these (`test/run-public-test.js`).
- **Licences.** Code you contribute is GPL-3.0-or-later; art and writing are CC BY-SA 4.0 (see
  ASSETS-LICENSE.md). Only add third-party parts whose licence allows this, and list them in
  THIRD-PARTY.md.
- **Versions.** Each change that ships bumps `bob.build` and `version` in `package.json`
  (`0.9.<build>`).

Run Bob from source with `npm install` then `npm start`, or just the server with `npm run server`.
