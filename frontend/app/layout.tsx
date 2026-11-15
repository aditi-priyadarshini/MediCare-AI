import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MediCare AI", template: "%s · MediCare AI" },
  description: "Your health, connected.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#123B43" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
