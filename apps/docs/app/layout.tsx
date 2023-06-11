import { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "lexical-beautiful-mentions",
  description: "Generated by create next app",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{metadata.title}</title>
      </head>

      <body className="bg-gray-200 font-sans dark:bg-gray-800">{children}</body>
    </html>
  );
}
