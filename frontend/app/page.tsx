import { redirect } from "next/navigation";

// The dashboard lives at /dashboard inside the (app) route group, which provides ProfileLoader.
// "/" just forwards there; the (app) layout sends signed-out visitors on to /login.
export default function HomePage() {
  redirect("/dashboard");
}
