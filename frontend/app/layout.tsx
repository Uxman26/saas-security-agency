import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: {
    default: "ControlOps — Command with Clarity",
    template: "%s | ControlOps",
  },
  description: "Command with Clarity — smart workforce management for security teams",
  icons: {
    icon: "/ControlOps-Logos/controlOps-icon.png",
    apple: "/ControlOps-Logos/controlOps-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
