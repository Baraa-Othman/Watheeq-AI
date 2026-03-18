// TODO: Root layout - wrap all pages with providers (e.g. Firebase Auth)
import React from "react";
import "../styles/globals.css";
// TODO: Add metadata, fonts, global structure
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
