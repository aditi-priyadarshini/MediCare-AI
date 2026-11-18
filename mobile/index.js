import { registerRootComponent } from "expo";
import App from "./App";
import { registerBackgroundHandlers } from "./src/incomingCall";

// Must run before the app component mounts so a push that arrives while the app is closed
// (Android headless JS) can show the ringing screen.
registerBackgroundHandlers();
registerRootComponent(App);
