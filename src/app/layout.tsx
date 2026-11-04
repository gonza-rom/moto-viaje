import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import { RegistrarSW } from "@/components/Pwa";

export const metadata: Metadata = {
  title: { default: "Mis viajes en moto", template: "%s · Mis viajes" },
  description: "Bitácora personal de viajes en moto",
  robots: { index: false, follow: false },
  applicationName: "Mis viajes",
  appleWebApp: { capable: true, title: "Mis viajes", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0e0f11",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh font-sans">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
