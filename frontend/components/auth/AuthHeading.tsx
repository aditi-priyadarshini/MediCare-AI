/** Page heading for every auth screen: one h1, one calm line under it. */
export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-h1 text-navy-900">{title}</h1>
      {children && <p className="mt-1.5 text-base text-ink-soft">{children}</p>}
    </div>
  );
}
