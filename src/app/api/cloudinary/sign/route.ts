import { NextResponse } from "next/server";
import { cloudinary, CLD_FOLDER } from "@/lib/cloudinary";

const TIPOS = {
  foto: { folder: "fotos", resourceType: "image" },
  video: { folder: "videos", resourceType: "video" },
  gpx: { folder: "gpx", resourceType: "raw" },
} as const;

// Firma subidas directas navegador → Cloudinary (evita el límite de body de Vercel).
// Protegido por el middleware (requiere sesión).
export async function POST(req: Request) {
  const { tipo } = (await req.json().catch(() => ({}))) as { tipo?: keyof typeof TIPOS };
  const cfg = TIPOS[tipo && tipo in TIPOS ? tipo : "foto"];
  const folder = `${CLD_FOLDER}/${cfg.folder}`;
  const timestamp = Math.round(Date.now() / 1000);

  const params: Record<string, string | number> = { folder, timestamp };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET!);

  return NextResponse.json({
    signature,
    timestamp,
    folder,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    resourceType: cfg.resourceType,
  });
}
