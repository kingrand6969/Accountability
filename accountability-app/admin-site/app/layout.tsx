import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mantle Admin",
  description: "Secure administration console for Mantle.",
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
