import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mantle — Build consistency together",
  description: "Open a trusted Mantle update or get the mobile app.",
  metadataBase: new URL("https://joinaccountability.app"),
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
