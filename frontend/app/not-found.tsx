import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-xl font-semibold text-navy-900">Page not found</h1>
      <p className="mt-2 text-ink-soft">That page doesn’t exist or has moved.</p>
      <Link href="/dashboard" className="mt-4 inline-block font-semibold text-teal-700 underline">
        Go to your dashboard
      </Link>
    </main>
  );
}
