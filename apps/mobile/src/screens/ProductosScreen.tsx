import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import type { Categoria, Producto } from '../types';
import {
  actualizarProducto,
  crearProducto,
  eliminarProducto,
  listarCategorias,
  listarProductos,
} from '../db/repos/catalogo';
import { borrarImagenProducto, guardarImagenProducto } from '../utils/imagenes';
import { useAvisos } from '../store/avisos';
import { useSesion } from '../store/sesion';
import { useSync } from '../store/sync';
import { useTema } from '../store/tema';
import {
  Boton,
  Campo,
  Chip,
  ConfirmarModal,
  Encabezado,
  Hoja,
  ListaVacia,
  PaletaColores,
  Pantalla,
  Superficie,
  parsearMonto,
} from '../components/UI';
import { fuentes, radius, spacing, typography } from '../theme';

export default function ProductosScreen() {
  const db = useSQLiteContext();
  const { colores } = useTema();
  const navigation = useNavigation();
  const mostrarAviso = useAvisos((s) => s.mostrar);
  const usuario = useSesion((s) => s.usuario)!;
  const ultimaSync = useSync((s) => s.ultimaSync);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaSel, setCategoriaSel] = useState<number | 'todas'>('todas');
  const [cargando, setCargando] = useState(true);

  const [form, setForm] = useState<{
    abierto: boolean;
    editar: Producto | null;
    nombre: string;
    precio: string;
    emoji: string;
    color: string;
    imagen: string | null;
    imagenCambiada: boolean;
    categoriaId: number | null;
    activo: boolean;
    stock: string;
    stockMinimo: string;
  }>({
    abierto: false,
    editar: null,
    nombre: '',
    precio: '',
    emoji: '🛍️',
    color: '#3F3FB0',
    imagen: null,
    imagenCambiada: false,
    categoriaId: null,
    activo: true,
    stock: '',
    stockMinimo: '5',
  });
  const [borrando, setBorrando] = useState<Producto | null>(null);

  const cargar = useCallback(async () => {
    const [p, c] = await Promise.all([listarProductos(db), listarCategorias(db)]);
    setProductos(p);
    setCategorias(c);
    setCargando(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(() => setCargando(false));
    }, [cargar, ultimaSync])
  );

  const q = busqueda.trim().toLowerCase();
  const filtrados = productos.filter(
    (p) =>
      (q === '' || p.nombre.toLowerCase().includes(q)) &&
      (categoriaSel === 'todas' || p.categoriaId === categoriaSel)
  );

  function abrirForm(p: Producto | null) {
    setForm({
      abierto: true,
      editar: p,
      nombre: p?.nombre ?? '',
      precio: p ? String(p.precio) : '',
      emoji: p?.emoji ?? '🛍️',
      color: p?.color ?? '#3F3FB0',
      imagen: p?.imagen ?? null,
      imagenCambiada: false,
      categoriaId: p?.categoriaId ?? null,
      activo: p?.activo ?? true,
      stock: p ? String(p.stock) : '',
      stockMinimo: p ? String(p.stockMinimo) : '5',
    });
  }

  async function elegirFoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      setForm((f) => ({
        ...f,
        imagen: res.assets[0].uri,
        imagenCambiada: true,
      }));
    }
  }

  async function guardar() {
    if (!form.nombre.trim()) {
      mostrarAviso('Falta el nombre', 'Escribe el nombre del producto.');
      return;
    }
    const precio = parsearMonto(form.precio);
    if (precio <= 0) {
      mostrarAviso('Precio inválido', 'El precio debe ser mayor que cero.');
      return;
    }
    const stock = parsearMonto(form.stock);
    const stockMinimo = parsearMonto(form.stockMinimo) || 5;
    if (stock < 0) {
      mostrarAviso('Stock inválido', 'El stock no puede ser negativo.');
      return;
    }
    const datos = {
      categoriaId: form.categoriaId,
      nombre: form.nombre.trim(),
      precio,
      emoji: form.emoji.trim() || '🛍️',
      color: form.color,
      orden: form.editar?.orden ?? productos.length + 1,
      activo: form.activo,
      stock,
      stockMinimo,
    };
    let imagen = form.imagen;
    if (form.imagenCambiada) {
      if (form.imagen) {
        const nueva = await guardarImagenProducto(form.imagen);
        if (nueva) {
          imagen = nueva;
          if (form.editar?.imagen) {
            await borrarImagenProducto(form.editar.imagen);
          }
        } else if (form.editar?.imagen) {
          imagen = form.editar.imagen;
        }
      } else {
        imagen = null;
        if (form.editar?.imagen) {
          await borrarImagenProducto(form.editar.imagen);
        }
      }
    }
    if (form.editar) {
      await actualizarProducto(db, { ...datos, id: form.editar.id, imagen });
    } else {
      await crearProducto(db, { ...datos, imagen });
    }
    setForm((f) => ({ ...f, abierto: false }));
    await cargar();
  }

  async function borrar() {
    if (!borrando) return;
    await eliminarProducto(db, borrando.id);
    await borrarImagenProducto(borrando.imagen);
    setBorrando(null);
    await cargar();
  }

  if (cargando) {
    return (
      <Pantalla>
        <Encabezado titulo="Inventario" onAtras={() => navigation.goBack()} />
        <Superficie>
          <ListaVacia emoji="⏳" titulo="Cargando…" />
        </Superficie>
      </Pantalla>
    );
  }

  if (usuario.rol !== 'admin') {
    return (
      <Pantalla>
        <Encabezado titulo="Inventario" onAtras={() => navigation.goBack()} />
        <Superficie>
          <ListaVacia
            emoji="🔒"
            titulo="Acceso restringido"
            subtitulo="Solo el administrador puede administrar el inventario"
          />
        </Superficie>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Encabezado
        titulo="Inventario"
        subtitulo={`${productos.length} ${productos.length === 1 ? 'producto' : 'productos'}`}
        onAtras={() => navigation.goBack()}
      />
      <Superficie>
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
          <Campo valor={busqueda} onChange={setBusqueda} placeholder="Buscar producto…" icono="search" />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.chips}
        >
          <Chip etiqueta="Todas" activo={categoriaSel === 'todas'} onPress={() => setCategoriaSel('todas')} />
          {categorias.map((c) => (
            <Chip
              key={c.id}
              etiqueta={c.nombre}
              color={c.color}
              activo={categoriaSel === c.id}
              onPress={() => setCategoriaSel(c.id)}
            />
          ))}
        </ScrollView>

        <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: 96 }]}>
          {filtrados.length === 0 ? (
            <ListaVacia emoji="🧾" titulo="Sin productos" subtitulo="Toca + para agregar el primero" />
          ) : (
            filtrados.map((p, i) => {
              return (
                <Pressable
                  key={p.id}
                  onPress={() => abrirForm(p)}
                  style={({ pressed }) => [
                    styles.filaProducto,
                    { borderTopColor: colores.borde },
                    i === 0 && { borderTopWidth: 0 },
                    pressed && { backgroundColor: colores.superficieSuave },
                  ]}
                >
                  <View style={[styles.emojiMini, { backgroundColor: colores.superficieSuave }]}>
                    {p.imagen ? (
                      <Image source={{ uri: p.imagen }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 24 }}>{p.emoji}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.filaTitulo, { color: colores.texto }]} numberOfLines={1}>
                      {p.nombre}
                    </Text>
                    <Text style={[styles.filaSub, { color: colores.textoSuave }]} numberOfLines={1}>
                      Stock: {p.stock}
                    </Text>
                  </View>
                  <View style={styles.accionesProducto}>
                    <Pressable
                      onPress={() => setBorrando(p)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Eliminar ${p.nombre}`}
                      style={({ pressed }) => [
                        styles.accionIcono,
                        { backgroundColor: colores.peligroSuave },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <MaterialIcons name="delete-outline" size={17} color={colores.peligro} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <View style={[styles.barraInferior, { backgroundColor: colores.superficie, borderTopColor: colores.borde }]}>
          <Boton
            titulo="Actualizar stock"
            icono="add"
            tamanio="lg"
            onPress={() => abrirForm(null)}
          />
        </View>
      </Superficie>

      <Hoja
        visible={form.abierto}
        onCerrar={() => setForm((f) => ({ ...f, abierto: false }))}
        titulo={form.editar ? 'Editar producto' : 'Nuevo producto'}
        pie={
          <Boton
            titulo={form.editar ? 'Guardar cambios' : 'Agregar producto'}
            tamanio="lg"
            onPress={guardar}
          />
        }
      >
        <Campo
          etiqueta="Nombre"
          valor={form.nombre}
          onChange={(t) => setForm((f) => ({ ...f, nombre: t }))}
          placeholder="Ej.: Café con leche"
          icono="inventory-2"
        />
        <Campo
          etiqueta="Precio"
          valor={form.precio}
          onChange={(t) => setForm((f) => ({ ...f, precio: t }))}
          teclado="numeric"
          placeholder="0.00"
          icono="payments"
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Campo
              etiqueta="Stock disponible"
              valor={form.stock}
              onChange={(t) => setForm((f) => ({ ...f, stock: t.replace(/\D/g, '').slice(0, 5) }))}
              teclado="numeric"
              placeholder="0"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Campo
              etiqueta="Stock mínimo"
              valor={form.stockMinimo}
              onChange={(t) => setForm((f) => ({ ...f, stockMinimo: t.replace(/\D/g, '').slice(0, 5) }))}
              teclado="numeric"
              placeholder="5"
            />
          </View>
        </View>
        <Campo
          etiqueta="Emoji"
          valor={form.emoji}
          onChange={(t) => setForm((f) => ({ ...f, emoji: t }))}
          placeholder="🍕"
        />
        <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Foto del producto (opcional)</Text>
        <View style={styles.fotoFila}>
          <Pressable
            onPress={elegirFoto}
            style={({ pressed }) => [
              styles.fotoCaja,
              {
                backgroundColor: colores.superficieSuave,
                borderColor: colores.borde,
              },
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
          >
            {form.imagen ? (
              <>
                <Image source={{ uri: form.imagen }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <View style={styles.fotoCambiar}>
                  <MaterialIcons name="photo-camera" size={14} color="#FFFFFF" />
                </View>
              </>
            ) : (
              <>
                <MaterialIcons name="add-a-photo" size={26} color={colores.textoSuave} />
                <Text style={[styles.fotoTexto, { color: colores.textoSuave }]}>Agregar foto</Text>
              </>
            )}
          </Pressable>
          {form.imagen ? (
            <Pressable
              onPress={() => setForm((f) => ({ ...f, imagen: null, imagenCambiada: true }))}
              style={({ pressed }) => [
                styles.fotoQuitar,
                { backgroundColor: colores.peligroSuave },
                pressed && { opacity: 0.8 },
              ]}
            >
              <MaterialIcons name="delete-outline" size={18} color={colores.peligro} />
              <Text style={[styles.fotoQuitarTexto, { color: colores.peligro }]}>Quitar</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Color</Text>
        <PaletaColores seleccion={form.color} onSeleccion={(c) => setForm((f) => ({ ...f, color: c }))} />
        <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Categoría</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Chip
            etiqueta="Sin categoría"
            activo={form.categoriaId === null}
            onPress={() => setForm((f) => ({ ...f, categoriaId: null }))}
          />
          {categorias.map((c) => (
            <Chip
              key={c.id}
              etiqueta={c.nombre}
              color={c.color}
              activo={form.categoriaId === c.id}
              onPress={() => setForm((f) => ({ ...f, categoriaId: c.id }))}
            />
          ))}
        </View>
        <View style={styles.switchFila}>
          <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Producto activo</Text>
          <Switch
            value={form.activo}
            onValueChange={(v) => setForm((f) => ({ ...f, activo: v }))}
            trackColor={{ true: colores.primario, false: colores.borde }}
          />
        </View>
      </Hoja>

      <ConfirmarModal
        visible={!!borrando}
        onCerrar={() => setBorrando(null)}
        onConfirmar={borrar}
        titulo="Eliminar producto"
        mensaje={`¿Eliminar "${borrando?.nombre}"? Esta acción no se puede deshacer.`}
        textoConfirmar="Eliminar"
        peligro
      />
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  contenido: { paddingHorizontal: spacing.md },
  filaProducto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  emojiMini: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  accionesProducto: {
    alignItems: 'center',
    gap: 4,
  },
  accionIcono: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaTitulo: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  filaSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 1 },
  precioTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  barraInferior: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  fotoFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  fotoCaja: {
    width: 96,
    height: 96,
    borderRadius: radius.tarjeta,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  fotoTexto: { fontSize: typography.cuerpoChico, fontFamily: fuentes.medium },
  fotoCambiar: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fotoQuitar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  fotoQuitarTexto: { fontSize: typography.cuerpoChico, fontFamily: fuentes.semibold },
  formEtiqueta: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  switchFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
});
