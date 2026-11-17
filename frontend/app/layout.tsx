import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter"; // self-hosted: no runtime request to a font CDN
import { AuthProvider } from "@/lib/auth-context";
import { ExperienceProvider } from "@/lib/experience";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MediCare AI", template: "%s · MediCare AI" },
  description: "Your health, connected.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#123B43" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <ExperienceProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ExperienceProvider>
      </body>
    </html>
  );
}
