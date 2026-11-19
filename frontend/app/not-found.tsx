import { Compass } from "lucide-react";
import { Logo } from "@/components/brand";
import { LinkButton } from "@/components/ui/LinkButton";

export const metadata = { title: "Page not found" };

/** "/" sends signed-in people to the dashboard and everyone else to sign in, so one link fits both. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <Logo />
      <div
        aria-hidden
        className="mt-10 flex h-14 w-14 items-center justify-center rounded-full bg-mint-100 text-teal-700"
      >
        <Compass className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-h1 text-navy-900">We can’t find that page</h1>
      <p className="mt-2 max-w-sm text-base text-ink-soft">
        The link may be old or mistyped. Your records are unaffected.
      </p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <LinkButton href="/">Go to home</LinkButton>
        <LinkButton href="/emergency" variant="secondary">
          Emergency help
        </LinkButton>
      </div>
    </main>
  );
}
