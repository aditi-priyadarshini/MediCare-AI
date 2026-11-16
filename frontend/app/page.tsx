import type { Metadata } from "next";
import { SharedClient } from "@/components/sharing/SharedClient";

export const metadata: Metadata = {
  title: "Shared health information",
  robots: { index: false, follow: false },
};

export default function SharedPage() {
  return <SharedClient />;
}
