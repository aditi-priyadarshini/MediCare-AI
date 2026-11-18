/**
 * Lets the app's single activity appear over the lock screen and wake the display, which is
 * what makes a reminder call look like a phone call when the phone is locked.
 */
const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withCallScreen(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$["android:name"] === ".MainActivity");
    if (main) {
      main.$["android:showWhenLocked"] = "true";
      main.$["android:turnScreenOn"] = "true";
    }
    return cfg;
  });
};
