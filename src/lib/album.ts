// Álbum compartido: constantes y firma de subidas (servidor). El acceso se valida con el token del viaje.
import "server-only";
import { cloudinary, CLD_FOLDER, TRANSFORMACION_FOTO } from "./cloudinary";

export const ALBUM_FOLDER = `${CLD_FOLDER}/fotos`;
export const ALBUM_FORMATOS = "jpg,jpeg,png,webp,heic,heif";
/** Máximo de fotos que se pueden subir desde el álbum a un mismo viaje */
export const ALBUM_MAX_FOTOS = 500;

export function firmarSubidaAlbum() {
  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder: ALBUM_FOLDER, timestamp, allowed_formats: ALBUM_FORMATOS, transformation: TRANSFORMACION_FOTO };
  return {
    ...params,
    signature: cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET!),
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
  };
}
