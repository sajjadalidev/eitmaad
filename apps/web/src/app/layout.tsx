import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Etimaad: COD trust network for Pakistani merchants", template: "%s | Etimaad" },
  description: "Check a customer's delivery record before you ship cash on delivery.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
