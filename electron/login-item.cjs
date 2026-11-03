// "Launch on start-up" (Settings). Bob registers himself with '--hidden' so he starts in the tray. Windows matches
// the entry together with its arguments, so it is read both with and without them, and switching off clears both.
const LOGIN_ARGS = ['--hidden'];
function loginItem(app) {
  return {
    get: () => Boolean(app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin || app.getLoginItemSettings().openAtLogin),
    set: (on) => {
      if (!on) app.setLoginItemSettings({ openAtLogin: false }); // an older entry without arguments
      app.setLoginItemSettings({ openAtLogin: Boolean(on), args: LOGIN_ARGS });
    }
  };
}
module.exports = { loginItem, LOGIN_ARGS };
