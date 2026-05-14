import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";

import { AuthProvider } from "@/components/AuthProvider";

import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Client Portal",
  description: "Investor and client self-service portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${hankenGrotesk.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
