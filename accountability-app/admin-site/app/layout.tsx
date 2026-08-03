import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccountAbility Admin",
  description: "Secure administration console for AccountAbility.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
