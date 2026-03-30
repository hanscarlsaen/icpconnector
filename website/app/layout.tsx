import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ICPConnector — Your AI Sales Agent",
  description:
    "Define your Ideal Customer Profile. Get verified leads delivered to your CRM — through a simple chat. No manual research needed.",
  openGraph: {
    title: "ICPConnector — Your AI Sales Agent",
    description:
      "Define your ICP. Get verified leads in Google Sheets, HubSpot, or Pipedrive via Telegram, Slack, or WhatsApp.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
