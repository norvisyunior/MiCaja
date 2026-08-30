import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

export async function guardarImagenProducto(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  if (Platform.OS === 'web') return uri;
  try {
    const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const nombre = `producto-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const destino = new File(Paths.document, nombre);
    await new File(uri).copy(destino);
    return destino.uri;
  } catch {
    return null;
  }
}

export async function borrarImagenProducto(uri: string | null): Promise<void> {
  if (!uri) return;
  try {
    const archivo = new File(uri);
    if (archivo.exists) {
      await archivo.delete();
    }
  } catch {
    // ignorar errores de borrado
  }
}