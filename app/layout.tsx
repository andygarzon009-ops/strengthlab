import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { Manrope } from "next/font/google";
import "./globals.css";

// Manrope carries the whole app. Geist was clean but neutral to the point of
// having no voice; Manrope's semi-geometric forms and tall figures read
// expensive at the sizes that matter here — the big stat numbers — while
// still being a UI face that holds up at 10px on a phone. One family, one
// voice: mixing a display face into a data-dense app means mixed-font lines
// wherever a number sits inside a sentence.
//
// Swapping the whole app's type is a one-line change here: any next/font
// import exposing --font-display works.
const display = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "StrengthLab",
  description: "Log your workouts, track PRs, and train with your crew.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StrengthLab",
  },
  formatDetection: { telephone: false },
  icons: {
    apple: [
      { url: "/icon-192.png", sizes: "192x192" },
      { url: "/icon-512.png", sizes: "512x512" },
    ],
    icon: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${GeistMono.variable} h-full`}
    >
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="StrengthLab" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${display.className} min-h-full antialiased`}>
        {children}
      </body>
    </html>
  );
}
