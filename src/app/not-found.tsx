import Link from "next/link";
import { House, MapPinOff } from "lucide-react";

export default function NoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="space-y-4 text-center">
        <MapPinOff className="mx-auto size-12 text-naranja" strokeWidth={1.5} />
        <h1 className="font-display text-4xl font-bold uppercase">Te perdiste</h1>
        <p className="text-niebla">Esta página o este viaje no existe.</p>
        <Link href="/" className="btn-primary">
          <House className="size-4" /> Volver al inicio
        </Link>
      </div>
    </main>
  );
}
