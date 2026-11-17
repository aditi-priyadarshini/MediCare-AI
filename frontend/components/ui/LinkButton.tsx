import Link from "next/link";
import { buttonClass } from "@/components/ui/primitives";

type LinkButtonProps = Omit<React.ComponentProps<typeof Link>, "className"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
};

/** A link that looks like a Button. Use it for "Add ..." actions that open their own page. */
export function LinkButton({ variant = "primary", size = "md", fullWidth, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClass({ variant, size, fullWidth, className })} {...rest}>
      {children}
    </Link>
  );
}
