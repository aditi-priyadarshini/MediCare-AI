import { redirect } from "next/navigation";

/** The root is not a screen of its own: signed-in people land on the dashboard, and the app layout sends anyone signed out to the login page. */
export default function HomePage() {
  redirect("/dashboard");
}
