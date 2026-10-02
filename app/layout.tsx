import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Commonlight · BC + AI portraits",
  description: "A private, local-first portrait studio prototype.",
  robots: { index: false, follow: false },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
