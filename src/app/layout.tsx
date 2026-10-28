import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Proof",
  description: "Prove your skills with evidence, not just claims.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
