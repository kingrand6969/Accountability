import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccountAbility — Build consistency together",
  description: "Open a trusted AccountAbility update or get the mobile app.",
  metadataBase: new URL("https://joinaccountability.app"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
