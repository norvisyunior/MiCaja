import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Categoria, Producto } from '../types';
import {
  actualizarProducto,
  crearProducto,
  eliminarProducto,
  listarCategorias,
  listarProductos,
} from '../db/repos/catalogo';
import { useAvisos } from '../store/avisos';
import { useSesion } from '../store/sesion';
import { useTema } from '../store/tema';
import {
  Boton,
  Campo,
  Chip,
  ConfirmarModal,
  Encabezado,
  EstadoStock,
  Gradiente,
  Hoja,
  ListaVacia,
  PaletaColores,
  Pantalla,
  parsearMonto,
  SombraDura,
} from '../components/UI';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';

export default function ProductosScreen() {
  const db = useSQLiteContext();
  const { colores } = useTema();
  const navigation = useNavigation();
  const mostrarAviso = useAvisos((s) => s.mostrar);
  const usuario = useSesion((s) => s.usuario)!;

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
    color: '#A855F7',
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
    }, [cargar])
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
      color: p?.color ?? '#A855F7',
      categoriaId: p?.categoriaId ?? null,
      activo: p?.activo ?? true,
      stock: p ? String(p.stock) : '',
      stockMinimo: p ? String(p.stockMinimo) : '5',
    });
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
    if (form.editar) {
      await actualizarProducto(db, { ...datos, id: form.editar.id });
    } else {
      await crearProducto(db, datos);
    }
    setForm((f) => ({ ...f, abierto: false }));
    await cargar();
  }

  async function borrar() {
    if (!borrando) return;
    await eliminarProducto(db, borrando.id);
    setBorrando(null);
    await cargar();
  }

  if (cargando) {
    return (
      <Pantalla>
        <Encabezado titulo="Productos" />
        <ListaVacia emoji="⏳" titulo="Cargando…" />
      </Pantalla>
    );
  }

  if (usuario.rol !== 'admin') {
    return (
      <Pantalla>
        <Encabezado titulo="Productos" onAtras={() => navigation.goBack()} />
        <ListaVacia
          emoji="🔒"
          titulo="Acceso restringido"
          subtitulo="Solo el administrador puede administrar el inventario"
        />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Encabezado
        titulo="Productos"
        subtitulo={`${productos.length} en el catálogo`}
        onAtras={() => navigation.goBack()}
          derecha={
          <Pressable
            onPress={() => abrirForm(null)}
            style={({ pressed }) => [
              styles.fab,
              { shadowColor: colores.sombra },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <Gradiente colores={gradientes.primario} estilo={StyleSheet.absoluteFill} />
            <MaterialIcons name="add" size={26} color="#FFFFFF" />
          </Pressable>
          }
      />
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md }}>
        <Campo valor={busqueda} onChange={setBusqueda} placeholder="Buscar producto…" icono="search" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: spacing.sm }}
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
      </View>
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: 60 }]}>
        {filtrados.length === 0 ? (
          <ListaVacia emoji="🧾" titulo="Sin productos" subtitulo="Toca + para agregar el primero" />
        ) : (
          filtrados.map((p) => {
            const cat = categorias.find((c) => c.id === p.categoriaId);
            return (
              <SombraDura key={p.id} offset={2} redondeo={radius.lg} estilo={styles.filaSombra}>
                <View
                  style={[styles.filaProducto, { backgroundColor: colores.superficie, borderColor: colores.borde }]}
                >
                  <View style={[styles.emojiMini, { backgroundColor: `${p.color}14`, borderColor: colores.borde }]}>
                    <Text style={{ fontSize: 22 }}>{p.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.filaTitulo, { color: colores.texto }]}>{p.nombre}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 }}>
                      <Text style={[styles.precioTexto, { color: p.color }]}>
                        {p.precio.toFixed(2)}
                      </Text>
                      {cat ? (
                        <Text style={[styles.filaSub, { color: colores.textoSuave }]}>· {cat.nombre}</Text>
                      ) : null}
                    </View>
                    <View style={{ marginTop: 6 }}>
                      <EstadoStock stock={p.stock} stockMinimo={p.stockMinimo} />
                    </View>
                  </View>
                  <Switch
                    value={p.activo}
                    onValueChange={async (v) => {
                      await actualizarProducto(db, { ...p, activo: v });
                      await cargar();
                    }}
                    trackColor={{ true: colores.acento, false: colores.borde }}
                  />
                  <Pressable onPress={() => abrirForm(p)} hitSlop={8} style={{ padding: 4 }}>
                    <MaterialIcons name="edit" size={20} color={colores.textoSuave} />
                  </Pressable>
                  <Pressable onPress={() => setBorrando(p)} hitSlop={8} style={{ padding: 4 }}>
                    <MaterialIcons name="delete-outline" size={20} color={colores.peligro} />
                  </Pressable>
                </View>
              </SombraDura>
            );
          })
        )}
      </ScrollView>

      <Hoja
        visible={form.abierto}
        onCerrar={() => setForm((f) => ({ ...f, abierto: false }))}
        titulo={form.editar ? 'Editar producto' : 'Nuevo producto'}
        pie={
          <Boton
            titulo={form.editar ? 'Guardar cambios' : 'Agregar producto'}
            icono="save"
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
        />
        <Campo
          etiqueta="Precio"
          valor={form.precio}
          onChange={(t) => setForm((f) => ({ ...f, precio: t }))}
          teclado="numeric"
          placeholder="0.00"
        />
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end' }}>
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
            trackColor={{ true: colores.acento, false: colores.borde }}
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
  contenido: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  fab: {
    width: 44,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF',
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  filaSombra: { borderRadius: radius.lg },
  filaProducto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  emojiMini: {
    width: 44,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaTitulo: { fontSize: typography.cuerpo, fontFamily: fuentes.bold },
  filaSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular },
  precioTexto: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
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
