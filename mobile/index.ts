import { registerRootComponent } from "expo";
import App from "./App";
import { registerBackgroundHandlers } from "./src/calls/incomingCall";

// Must run before the app component mounts: a push that arrives while the app is closed runs
// this code headlessly so the phone can still ring.
registerBackgroundHandlers();
registerRootComponent(App);
