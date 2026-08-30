import { Platform } from 'react-native';
import { File } from 'expo-file-system';

export function uriToDataUri(base64: string, mimeType = 'image/jpeg'): string {
  return `data:${mimeType};base64,${base64}`;
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
