import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Categoria, Settings, Usuario } from '../types';
import {
  actualizarCategoria,
  actualizarUsuario,
  crearCategoria,
  crearUsuario,
  eliminarCategoria,
  eliminarUsuario,
  listarCategorias,
  listarUsuarios,
} from '../db/repos/catalogo';
import { guardarSetting, obtenerSettings } from '../db/repos/settings';
import { exportarVentasPDF, type RangoExportacion } from '../db/exportar';
import { useSesion } from '../store/sesion';
import { useAvisos } from '../store/avisos';
import { useTema } from '../store/tema';
import {
  Badge,
  Boton,
  Campo,
  Chip,
  ConfirmarModal,
  Encabezado,
  Gradiente,
  Hoja,
  ListaVacia,
  PaletaColores,
  Pantalla,
  SombraDura,
} from '../components/UI';
import { fuentes, gradientes, paletaProductos, radius, spacing, typography } from '../theme';
import type { ParamListRaiz } from '../navigation';

type Vista = 'menu' | 'categorias' | 'usuarios' | 'negocio';

const MONEDAS = ['CUP', 'MLC', 'USD'];

function Fila({
  icono,
  colorIcono,
  colorFondo,
  titulo,
  sub,
  onPress,
  peligro,
  iconoDerecha = 'chevron-right',
}: {
  icono: ReactNode;
  colorIcono: string;
  colorFondo: string;
  titulo: string;
  sub?: string;
  onPress?: () => void;
  peligro?: boolean;
  iconoDerecha?: 'chevron-right' | 'logout' | 'file-download' | 'chevron-right' | 'open-in-new';
}) {
  const { colores } = useTema();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fila,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.filaIcono, { backgroundColor: colorFondo }]}>{icono}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.filaTitulo, { color: peligro ? colores.peligro : colores.texto }]}>{titulo}</Text>
        {sub ? <Text style={[styles.filaSub, { color: colores.textoSuave }]}>{sub}</Text> : null}
      </View>
      <MaterialIcons
        name={iconoDerecha}
        size={20}
        color={peligro ? colores.peligro : colores.textoSuave}
      />
    </Pressable>
  );
}

export default function ConfigScreen() {
  const db = useSQLiteContext();
  const usuario = useSesion((s) => s.usuario)!;
  const cerrar = useSesion((s) => s.cerrar);
  const { colores, modo, alternar } = useTema();
  const navigation = useNavigation<NavigationProp<ParamListRaiz>>();
  const mostrarAviso = useAvisos((s) => s.mostrar);

  const [vista, setVista] = useState<Vista>('menu');
  const [exportar, setExportar] = useState<null | 'hoja'>(null);

  if (vista === 'categorias') {
    return <CategoriasVista onAtras={() => setVista('menu')} />;
  }
  if (vista === 'usuarios') {
    return <UsuariosVista onAtras={() => setVista('menu')} />;
  }
  if (vista === 'negocio') {
    return <NegocioVista onAtras={() => setVista('menu')} />;
  }

  const esAdmin = usuario.rol === 'admin';
  const colorAvatar = paletaProductos[usuario.id % paletaProductos.length];

  return (
    <Pantalla>
      <Encabezado titulo="Ajustes" subtitulo="Administración del negocio" />
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: 110 }]}>
        <SombraDura redondeo={radius.md} offset={3} estilo={{ marginTop: spacing.sm }}>
          <View
            style={[
              styles.usuarioTarjeta,
              { backgroundColor: colores.superficie, borderColor: colores.borde },
            ]}
          >
            <View style={[styles.usuarioAvatar, { backgroundColor: colorAvatar }]}>
              <Text style={[styles.usuarioAvatarTexto, { color: '#FFFFFF' }]}>
                {usuario.nombre.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.usuarioNombre, { color: colores.texto }]}>{usuario.nombre}</Text>
              <Badge
                texto={esAdmin ? 'Administrador' : 'Dependiente'}
                color={esAdmin ? colores.primarioSuave : colores.infoSuave}
                colorTexto={esAdmin ? colores.primario : colores.info}
              />
            </View>
          </View>
        </SombraDura>

        {esAdmin ? (
          <>
            <Text style={[styles.seccion, { color: colores.textoSuave }]}>Gestión</Text>
            <SombraDura redondeo={radius.md} offset={3}>
              <View style={[styles.grupo, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
              <Fila
                icono={<MaterialIcons name="inventory-2" size={22} color={colores.info} />}
                colorIcono={colores.info}
                colorFondo={colores.infoSuave}
                titulo="Productos"
                sub="Catálogo, precios y stock"
                onPress={() => navigation.navigate('Productos')}
              />
              <View style={[styles.divisor, { backgroundColor: colores.borde }]} />
              <Fila
                icono={<MaterialIcons name="category" size={22} color={colores.advertencia} />}
                colorIcono={colores.advertencia}
                colorFondo={colores.advertenciaSuave}
                titulo="Categorías"
                sub="Agrupa tus productos"
                onPress={() => setVista('categorias')}
              />
              <View style={[styles.divisor, { backgroundColor: colores.borde }]} />
              <Fila
                icono={<MaterialIcons name="people" size={22} color={colores.acento} />}
                colorIcono={colores.acento}
                colorFondo={colores.acentoSuave}
                titulo="Usuarios"
                sub="Empleados y PIN de acceso"
                onPress={() => setVista('usuarios')}
              />
              </View>
            </SombraDura>
          </>
        ) : null}

        <Text style={[styles.seccion, { color: colores.textoSuave }]}>Apariencia</Text>
        <SombraDura redondeo={radius.md} offset={3}>
          <View style={[styles.grupo, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
            <View style={styles.fila}>
              <View style={[styles.filaIcono, { backgroundColor: colores.primarioSuave }]}>
                <MaterialIcons name="dark-mode" size={22} color={colores.primario} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.filaTitulo, { color: colores.texto }]}>Modo oscuro</Text>
                <Text style={[styles.filaSub, { color: colores.textoSuave }]}>
                  {modo === 'oscuro' ? 'Tema oscuro activo' : 'Tema claro activo'}
                </Text>
              </View>
              <Switch
                value={modo === 'oscuro'}
                onValueChange={async (v) => {
                  alternar();
                  await guardarSetting(db, 'tema', v ? 'oscuro' : 'claro');
                }}
                trackColor={{ true: colores.acento, false: colores.borde }}
              />
            </View>
          </View>
        </SombraDura>

        <Text style={[styles.seccion, { color: colores.textoSuave }]}>Negocio</Text>
        <SombraDura redondeo={radius.md} offset={3}>
          <View style={[styles.grupo, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
            {esAdmin ? (
              <>
                <Fila
                  icono={<MaterialIcons name="storefront" size={22} color={colores.advertencia} />}
                  colorIcono={colores.advertencia}
                  colorFondo={colores.advertenciaSuave}
                  titulo="Nombre y moneda"
                  sub="Datos que se muestran en la caja"
                  onPress={() => setVista('negocio')}
                />
                <View style={[styles.divisor, { backgroundColor: colores.borde }]} />
              </>
            ) : null}
            <Fila
              icono={<MaterialIcons name="file-download" size={22} color={colores.info} />}
              colorIcono={colores.info}
              colorFondo={colores.infoSuave}
              titulo="Exportar ventas"
              sub="Genera un PDF con las ventas"
              iconoDerecha="file-download"
              onPress={() => setExportar('hoja')}
            />
          </View>
        </SombraDura>

        <Text style={[styles.seccion, { color: colores.textoSuave }]}>Sesión</Text>
        <SombraDura redondeo={radius.md} offset={3}>
          <View style={[styles.grupo, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
          <Fila
            icono={<MaterialIcons name="logout" size={22} color={colores.peligro} />}
            colorIcono={colores.peligro}
            colorFondo={colores.peligroSuave}
            titulo="Cerrar sesión"
            sub="Volver al acceso con PIN"
            iconoDerecha="logout"
            peligro
            onPress={() =>
              mostrarAviso('Cerrar sesión', '¿Seguro que deseas salir?', [
                { texto: 'Cancelar', estilo: 'cancel' },
                { texto: 'Salir', estilo: 'peligro', onPress: cerrar },
              ])
            }
          />
          </View>
        </SombraDura>

        <Text style={[styles.version, { color: colores.textoSuave }]}>Caja Rápida · v1.0.0</Text>
      </ScrollView>

      <ExportarVentasHoja
        visible={exportar === 'hoja'}
        onCerrar={() => setExportar(null)}
      />
    </Pantalla>
  );
}

function ExportarVentasHoja({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  const db = useSQLiteContext();
  const { colores } = useTema();
  const mostrarAviso = useAvisos((s) => s.mostrar);
  const hoy = new Date();
  const [rango, setRango] = useState<RangoExportacion>('hoy');
  const [dia, setDia] = useState<Date>(hoy);
  const [exportando, setExportando] = useState(false);

  function rangoEtiqueta(): string {
    if (rango === 'hoy') return 'las ventas del día de hoy';
    if (rango === 'semana') return 'las ventas de la semana actual';
    if (rango === 'mes') return 'las ventas del mes actual';
    return `las ventas del ${dia.toLocaleDateString('es-CU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }

  async function exportar() {
    if (exportando) return;
    setExportando(true);
    try {
      const ok = await exportarVentasPDF(db, { rango, dia });
      if (ok) {
        mostrarAviso('Exportado', `Se generó el PDF con ${rangoEtiqueta()}.`);
      } else {
        mostrarAviso('No disponible', 'El intercambio no está disponible en este dispositivo.');
      }
    } catch {
      mostrarAviso('Error', 'No se pudo exportar las ventas.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <Hoja
      visible={visible}
      onCerrar={onCerrar}
      titulo="Exportar ventas"
      subtitulo="Elige el período del reporte en PDF"
      pie={
        <Boton
          titulo="Generar PDF"
          icono="file-download"
          variante="acento"
          tamanio="lg"
          cargando={exportando}
          onPress={exportar}
        />
      }
    >
      <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Período</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
        <Chip
          etiqueta="Hoy"
          activo={rango === 'hoy'}
          onPress={() => {
            setRango('hoy');
            setDia(hoy);
          }}
        />
        <Chip
          etiqueta="Esta semana"
          activo={rango === 'semana'}
          onPress={() => {
            setRango('semana');
            setDia(hoy);
          }}
        />
        <Chip
          etiqueta="Este mes"
          activo={rango === 'mes'}
          onPress={() => {
            setRango('mes');
            setDia(hoy);
          }}
        />
        <Chip
          etiqueta="Un día específico"
          activo={rango === 'dia'}
          onPress={() => {
            setRango('dia');
            setDia(hoy);
          }}
        />
      </View>

      {rango === 'dia' ? (
        <DiaSelector valor={dia} onChange={setDia} />
      ) : null}

      <View style={[styles.vistaPreviaExport, { backgroundColor: colores.superficieSuave }]}>
        <MaterialIcons name="description" size={20} color={colores.primario} />
        <Text style={[styles.vistaPreviaExportTexto, { color: colores.texto }]}>
          Se exportarán {rangoEtiqueta()}.
        </Text>
      </View>
    </Hoja>
  );
}

function DiaSelector({ valor, onChange }: { valor: Date; onChange: (d: Date) => void }) {
  const { colores } = useTema();
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState(() => new Date(valor.getFullYear(), valor.getMonth(), 1));

  const anio = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const primerDia = new Date(anio, mes, 1).getDay();
  const nombresDias = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  const celdas: (number | null)[] = [];
  for (let i = 0; i < primerDia; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d);

  const puedeMesAnterior = () => {
    const anterior = new Date(anio, mes - 1, 1);
    const hoyMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return anterior.getTime() <= hoyMes.getTime();
  };
  const puedeMesSiguiente = () => {
    const siguiente = new Date(anio, mes + 1, 1);
    const hoyMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return siguiente.getTime() <= hoyMes.getTime();
  };
  const seleccionada = (d: number) =>
    valor.getDate() === d && valor.getMonth() === mes && valor.getFullYear() === anio;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
        <Pressable
          onPress={() => puedeMesAnterior() && setMesVisible(new Date(anio, mes - 1, 1))}
          style={({ pressed }) => [
            styles.diaNav,
            { backgroundColor: colores.superficie, borderColor: colores.borde },
            pressed && { opacity: 0.7 },
            !puedeMesAnterior() && { opacity: 0.3 },
          ]}
        >
          <MaterialIcons name="chevron-left" size={20} color={colores.texto} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: typography.cuerpo, fontFamily: fuentes.bold, color: colores.texto }}>
            {mesVisible.toLocaleDateString('es-CU', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        <Pressable
          onPress={() => puedeMesSiguiente() && setMesVisible(new Date(anio, mes + 1, 1))}
          style={({ pressed }) => [
            styles.diaNav,
            { backgroundColor: colores.superficie, borderColor: colores.borde },
            pressed && { opacity: 0.7 },
            !puedeMesSiguiente() && { opacity: 0.3 },
          ]}
        >
          <MaterialIcons name="chevron-right" size={20} color={colores.texto} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {nombresDias.map((n, i) => (
          <View key={i} style={styles.diaCelda}>
            <Text style={{ fontSize: 11, fontFamily: fuentes.bold, color: colores.textoSuave }}>{n}</Text>
          </View>
        ))}
        {celdas.map((d, i) =>
          d === null ? (
            <View key={i} style={styles.diaCelda} />
          ) : (
            <View key={i} style={styles.diaCelda}>
              <Pressable
                onPress={() => onChange(new Date(anio, mes, d))}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.diaBoton,
                  seleccionada(d) && { backgroundColor: colores.acento, borderWidth: StyleSheet.hairlineWidth, borderColor: colores.primario },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: fuentes.bold,
                    color: seleccionada(d) ? colores.textoInverso : colores.texto,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {d}
                </Text>
              </Pressable>
            </View>
          )
        )}
      </View>
    </View>
  );
}

function CategoriasVista({ onAtras }: { onAtras: () => void }) {
  const db = useSQLiteContext();
  const { colores } = useTema();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [form, setForm] = useState<{ abierto: boolean; editar: Categoria | null; nombre: string; color: string }>({
    abierto: false,
    editar: null,
    nombre: '',
    color: '#A855F7',
  });
  const [borrando, setBorrando] = useState<Categoria | null>(null);

  const cargar = useCallback(async () => {
    setCategorias(await listarCategorias(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(() => undefined);
    }, [cargar])
  );

  async function guardar() {
    if (!form.nombre.trim()) return;
    if (form.editar) {
      await actualizarCategoria(db, { id: form.editar.id, nombre: form.nombre.trim(), color: form.color, orden: form.editar.orden, activo: form.editar.activo });
    } else {
      await crearCategoria(db, { nombre: form.nombre.trim(), color: form.color, orden: categorias.length + 1, activo: true });
    }
    setForm((f) => ({ ...f, abierto: false }));
    await cargar();
  }

  async function borrar() {
    if (!borrando) return;
    await eliminarCategoria(db, borrando.id);
    setBorrando(null);
    await cargar();
  }

  return (
    <Pantalla>
      <Encabezado
        titulo="Categorías"
        subtitulo={`${categorias.length} categorías`}
        onAtras={onAtras}
        derecha={
          <Pressable
            onPress={() => setForm({ abierto: true, editar: null, nombre: '', color: '#A855F7' })}
            style={({ pressed }) => [
              styles.fab,
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <Gradiente colores={gradientes.primario} estilo={StyleSheet.absoluteFill} />
            <MaterialIcons name="add" size={26} color="#FFFFFF" />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: 60 }]}>
        {categorias.length === 0 ? (
          <ListaVacia emoji="🗂️" titulo="Sin categorías" subtitulo="Toca + para crear la primera" />
        ) : (
          categorias.map((c) => (
            <View key={c.id} style={[styles.filaProducto, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
              <View style={[styles.emojiMini, { backgroundColor: `${c.color}14` }]}>
                <View style={[styles.puntoColor, { backgroundColor: c.color }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.filaTitulo, { color: colores.texto }]}>{c.nombre}</Text>
              </View>
              <Switch
                value={c.activo}
                onValueChange={async (v) => {
                  await actualizarCategoria(db, { ...c, activo: v });
                  await cargar();
                }}
                trackColor={{ true: colores.acento, false: colores.borde }}
              />
              <Pressable
                onPress={() => setForm({ abierto: true, editar: c, nombre: c.nombre, color: c.color })}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <MaterialIcons name="edit" size={20} color={colores.textoSuave} />
              </Pressable>
              <Pressable onPress={() => setBorrando(c)} hitSlop={8} style={{ padding: 4 }}>
                <MaterialIcons name="delete-outline" size={20} color={colores.peligro} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <Hoja
        visible={form.abierto}
        onCerrar={() => setForm((f) => ({ ...f, abierto: false }))}
        titulo={form.editar ? 'Editar categoría' : 'Nueva categoría'}
        pie={<Boton titulo="Guardar" icono="save" tamanio="lg" onPress={guardar} />}
      >
        <Campo
          etiqueta="Nombre"
          valor={form.nombre}
          onChange={(t) => setForm((f) => ({ ...f, nombre: t }))}
          placeholder="Ej.: Postres"
          autoFocus
        />
        <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Color</Text>
        <PaletaColores seleccion={form.color} onSeleccion={(c) => setForm((f) => ({ ...f, color: c }))} />
      </Hoja>

      <ConfirmarModal
        visible={!!borrando}
        onCerrar={() => setBorrando(null)}
        onConfirmar={borrar}
        titulo="Eliminar categoría"
        mensaje={`¿Eliminar "${borrando?.nombre}"? Sus productos quedarán sin categoría.`}
        textoConfirmar="Eliminar"
        peligro
      />
    </Pantalla>
  );
}

function UsuariosVista({ onAtras }: { onAtras: () => void }) {
  const db = useSQLiteContext();
  const sesion = useSesion((s) => s.usuario)!;
  const { colores } = useTema();
  const mostrarAviso = useAvisos((s) => s.mostrar);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [form, setForm] = useState<{ abierto: boolean; editar: Usuario | null; nombre: string; rol: 'admin' | 'dependiente'; pin: string; activo: boolean }>({
    abierto: false,
    editar: null,
    nombre: '',
    rol: 'dependiente',
    pin: '',
    activo: true,
  });
  const [borrando, setBorrando] = useState<Usuario | null>(null);

  const cargar = useCallback(async () => {
    setUsuarios(await listarUsuarios(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(() => undefined);
    }, [cargar])
  );

  const admins = usuarios.filter((u) => u.rol === 'admin');

  async function guardar() {
    if (!form.nombre.trim()) {
      mostrarAviso('Falta el nombre', 'Escribe el nombre del usuario.');
      return;
    }
    if (!/^\d{4}$/.test(form.pin)) {
      mostrarAviso('PIN inválido', 'El PIN debe tener exactamente 4 dígitos.');
      return;
    }
    const editar = form.editar;
    if (editar && editar.rol === 'admin' && form.rol === 'dependiente' && admins.length <= 1) {
      mostrarAviso('No permitido', 'Debe existir al menos un administrador.');
      return;
    }
    const datos = { nombre: form.nombre.trim(), rol: form.rol, pin: form.pin, activo: form.activo };
    if (editar) {
      await actualizarUsuario(db, { ...datos, id: editar.id });
    } else {
      await crearUsuario(db, datos);
    }
    setForm((f) => ({ ...f, abierto: false }));
    await cargar();
  }

  async function borrar() {
    if (!borrando) return;
    if (borrando.id === sesion.id) {
      mostrarAviso('No permitido', 'No puedes eliminar tu propio usuario.');
      return;
    }
    if (borrando.rol === 'admin' && admins.length <= 1) {
      mostrarAviso('No permitido', 'Debe existir al menos un administrador.');
      return;
    }
    await eliminarUsuario(db, borrando.id);
    setBorrando(null);
    await cargar();
  }

  return (
    <Pantalla>
      <Encabezado
        titulo="Usuarios"
        subtitulo={`${usuarios.length} usuario(s)`}
        onAtras={onAtras}
        derecha={
          <Pressable
            onPress={() => setForm({ abierto: true, editar: null, nombre: '', rol: 'dependiente', pin: '', activo: true })}
            style={({ pressed }) => [
              styles.fab,
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <Gradiente colores={gradientes.primario} estilo={StyleSheet.absoluteFill} />
            <MaterialIcons name="add" size={26} color="#FFFFFF" />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: 60 }]}>
        {usuarios.map((u, i) => (
          <View key={u.id} style={[styles.filaProducto, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
            <View style={[styles.usuarioAvatar, { backgroundColor: paletaProductos[i % paletaProductos.length] }]}>
              <Text style={[styles.usuarioAvatarTexto, { color: '#FFFFFF' }]}>
                {u.nombre.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.filaTitulo, { color: colores.texto }]}>{u.nombre}</Text>
              <View style={{ marginTop: 4 }}>
                <Badge
                  texto={u.rol === 'admin' ? 'Admin' : 'Dependiente'}
                  color={u.rol === 'admin' ? colores.primarioSuave : colores.infoSuave}
                  colorTexto={u.rol === 'admin' ? colores.primario : colores.info}
                />
              </View>
            </View>
            <Switch
              value={u.activo}
              onValueChange={async (v) => {
                if (u.id === sesion.id && !v) {
                  mostrarAviso('No permitido', 'No puedes desactivar tu propio usuario.');
                  return;
                }
                await actualizarUsuario(db, { ...u, activo: v });
                await cargar();
              }}
              trackColor={{ true: colores.acento, false: colores.borde }}
            />
            <Pressable
              onPress={() => setForm({ abierto: true, editar: u, nombre: u.nombre, rol: u.rol, pin: u.pin, activo: u.activo })}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <MaterialIcons name="edit" size={20} color={colores.textoSuave} />
            </Pressable>
            <Pressable onPress={() => setBorrando(u)} hitSlop={8} style={{ padding: 4 }}>
              <MaterialIcons name="delete-outline" size={20} color={colores.peligro} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Hoja
        visible={form.abierto}
        onCerrar={() => setForm((f) => ({ ...f, abierto: false }))}
        titulo={form.editar ? 'Editar usuario' : 'Nuevo usuario'}
        pie={<Boton titulo="Guardar" icono="save" tamanio="lg" onPress={guardar} />}
      >
        <Campo
          etiqueta="Nombre"
          valor={form.nombre}
          onChange={(t) => setForm((f) => ({ ...f, nombre: t }))}
          placeholder="Ej.: María"
          autoFocus
        />
        <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Rol</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Chip etiqueta="Dependiente" icono="storefront" activo={form.rol === 'dependiente'} onPress={() => setForm((f) => ({ ...f, rol: 'dependiente' }))} />
          <Chip etiqueta="Administrador" icono="admin-panel-settings" activo={form.rol === 'admin'} color={colores.primario} onPress={() => setForm((f) => ({ ...f, rol: 'admin' }))} />
        </View>
        <Campo
          etiqueta="PIN (4 dígitos)"
          valor={form.pin}
          onChange={(t) => setForm((f) => ({ ...f, pin: t.replace(/\D/g, '').slice(0, 4) }))}
          teclado="numeric"
          placeholder="1234"
        />
        <View style={styles.switchFila}>
          <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Usuario activo</Text>
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
        titulo="Eliminar usuario"
        mensaje={`¿Eliminar a "${borrando?.nombre}"?`}
        textoConfirmar="Eliminar"
        peligro
      />
    </Pantalla>
  );
}

function NegocioVista({ onAtras }: { onAtras: () => void }) {
  const db = useSQLiteContext();
  const { colores } = useTema();
  const mostrarAviso = useAvisos((s) => s.mostrar);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState('CUP');
  const [simbolo, setSimbolo] = useState('$');

  useEffect(() => {
    obtenerSettings(db)
      .then((s) => {
        setSettings(s);
        setNombre(s.nombreNegocio);
        setMoneda(s.moneda);
        setSimbolo(s.simboloMoneda);
      })
      .catch(() => undefined);
  }, [db]);

  async function guardar() {
    await guardarSetting(db, 'nombre_negocio', nombre.trim() || 'Mi Negocio');
    await guardarSetting(db, 'moneda', moneda);
    await guardarSetting(db, 'simbolo_moneda', simbolo.trim() || '$');
    mostrarAviso('Guardado', 'La configuración del negocio se actualizó.');
  }

  if (!settings) {
    return (
      <Pantalla>
        <Encabezado titulo="Negocio" onAtras={onAtras} />
        <ListaVacia emoji="⏳" titulo="Cargando…" />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Encabezado titulo="Nombre y moneda" subtitulo="Datos de la caja" onAtras={onAtras} />
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: 60 }]} keyboardShouldPersistTaps="handled">
        <Campo
          etiqueta="Nombre del negocio"
          valor={nombre}
          onChange={setNombre}
          placeholder="Mi Negocio"
          icono="storefront"
        />
        <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Moneda</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
          {MONEDAS.map((m) => (
            <Chip key={m} etiqueta={m} activo={moneda === m} onPress={() => setMoneda(m)} />
          ))}
        </View>
        <Campo
          etiqueta="Símbolo de moneda"
          valor={simbolo}
          onChange={setSimbolo}
          placeholder="$"
          icono="payments"
        />
        <View style={[styles.vistaPrevia, { borderColor: colores.borde }]}>
          <Gradiente colores={gradientes.cta} estilo={StyleSheet.absoluteFill} />
          <Text style={styles.vistaPreviaLabel}>Vista previa en la caja</Text>
          <Text style={styles.vistaPreviaValor}>
            {simbolo || '$'}
            12.50
          </Text>
        </View>
        <Boton titulo="Guardar cambios" icono="save" tamanio="lg" onPress={guardar} />
      </ScrollView>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: { paddingHorizontal: spacing.lg },
  usuarioTarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  usuarioAvatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usuarioAvatarTexto: { fontSize: 22, fontFamily: fuentes.bold },
  usuarioNombre: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
    marginBottom: 4,
  },
  seccion: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  grupo: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.xs,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  filaIcono: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaTitulo: { fontSize: typography.cuerpo, fontFamily: fuentes.bold },
  filaSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 2 },
  divisor: { height: 1, marginHorizontal: spacing.md, opacity: 0.6 },
  fab: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  filaProducto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: undefined,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  emojiMini: {
    width: 44,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puntoColor: { width: 22, height: 22, borderRadius: radius.full },
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
  vistaPrevia: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginVertical: spacing.lg,
    alignItems: 'center',
    overflow: 'hidden',
  },
  vistaPreviaLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
  },
  vistaPreviaValor: {
    color: '#FFFFFF',
    fontSize: 38,
    fontFamily: fuentes.bold,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  version: {
    textAlign: 'center',
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: spacing.xl,
  },
  vistaPreviaExport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  vistaPreviaExportTexto: { flex: 1, fontSize: typography.cuerpoChico, fontFamily: fuentes.medium },
  diaNav: {
    width: 36,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaCelda: { width: '14.28%', alignItems: 'center', paddingVertical: 2 },
  diaBoton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
