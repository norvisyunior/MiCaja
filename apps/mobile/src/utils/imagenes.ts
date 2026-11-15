import { Image, Platform } from 'react-native';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';

// Las fotos se guardan dentro de SQLite como base64. Para que la base de datos
// y los backups no crezcan sin control, se limitan a 800 px por lado y se
// recomprimen en JPEG.
const MAX_LADO = 800;
const CALIDAD = 0.7;

export function uriToDataUri(base64: string, mimeType = 'image/jpeg'): string {
  return `data:${mimeType};base64,${base64}`;
}

function medirImagen(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null)
    );
  });
}

async function accionesParaOptimizar(uri: string): Promise<Action[]> {
  const medidas = await medirImagen(uri);
  if (!medidas || medidas.width <= 0 || medidas.height <= 0) {
    return [{ resize: { width: MAX_LADO } }];
  }

  const escala = Math.min(1, MAX_LADO / medidas.width, MAX_LADO / medidas.height);
  if (escala >= 1) return [];

  return [{ resize: { width: Math.max(1, Math.round(medidas.width * escala)) } }];
}

async function blobUriADataUri(uri: string): Promise<string | null> {
  try {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('No se pudo leer el blob'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function guardarImagenProducto(
  uri: string | null,
  base64?: string | null
): Promise<string | null> {
  if (!uri) return null;

  // Camino principal: redimensionar y recomprimir con código nativo.
  try {
    const acciones = await accionesParaOptimizar(uri);
    const resultado = await manipulateAsync(uri, acciones, {
      compress: CALIDAD,
      format: SaveFormat.JPEG,
      base64: true,
    });

    if (resultado.base64) {
      try {
        new File(resultado.uri).delete();
      } catch {
        // El archivo temporal lo limpia el sistema; no es crítico.
      }
      return uriToDataUri(resultado.base64, 'image/jpeg');
    }
  } catch {
    // Si el manipulador no está disponible, se usa el respaldo de abajo.
  }

  if (Platform.OS === 'web') {
    if (base64) {
      return uriToDataUri(base64);
    }
    return blobUriADataUri(uri);
  }

  try {
    let data: string;

    if (base64) {
      data = base64;
    } else {
      const source = new File(uri);
      if (!source.exists) return null;
      data = source.base64Sync();
    }

    if (!data) return null;

    const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return uriToDataUri(data, mime);
  } catch {
    return null;
  }
}

export async function borrarImagenProducto(_uri: string | null): Promise<void> {
  // Las imágenes ahora se almacenan en la DB, no hay archivos que borrar
}

export async function imagenArchivoADataUri(uri: string): Promise<string | null> {
  try {
    const source = new File(uri);
    if (!source.exists) return null;
    const data = source.base64Sync();
    if (!data) return null;

    const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const dataUri = uriToDataUri(data, mime);

    source.delete();
    return dataUri;
  } catch {
    return null;
  }
}
