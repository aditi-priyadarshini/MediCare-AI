import { createContext, useContext } from "react";
import type { AuthState } from "./types";

export interface AppSession {
  user: AuthState["user"];
  /** Opens the in-app call screen for this call id (used by the test buttons). */
  startCall: (callId: string) => void;
  signOut: () => Promise<void>;
}
export const SessionContext = createContext<AppSession | null>(null);
export const useSession = () => {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionContext");
  return s;
};
