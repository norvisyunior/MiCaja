import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Categoria, Settings, Usuario } from '../types';
import {
  actualizarCategoria,
  actualizarUsuario,
  crearCategoria,
  crearUsuario,
  eliminarCategoria,
  eliminarUsuario,
  existeNombreUsuario,
  listarCategorias,
  listarUsuarios,
} from '../db/repos/catalogo';
import { guardarSetting, obtenerSettings } from '../db/repos/settings';
import {
  cambiarPinPropio,
  desbloquearUsuario,
  establecerCodigoRecuperacion,
  generarCodigoRecuperacionPropio,
} from '../db/repos/acceso';
import { exportarVentasPDF, type RangoExportacion } from '../db/exportar';
import { exportarBackup, seleccionarArchivoRestore, validarArchivoRestore, restaurarBackup } from '../db/backup';
import { encolarUsuarioUpsert } from '../db/sync/encolar';
import { crearInvitacion } from '../api/cliente';
import {
  CLAVE_URL_SERVIDOR,
  leerTokenDispositivo,
  leerUrlServidor,
  normalizarUrlServidor,
} from '../api/config';
import { activarConCodigo, nombreDispositivoPorDefecto } from '../sync/activacion';
import {
  refrescarEstadoSync,
  reiniciarDescarga,
  reintentarRechazadas as reintentarRechazadasSync,
  sincronizar as ejecutarSync,
} from '../sync/motor';
import { useSesion } from '../store/sesion';
import { useAvisos } from '../store/avisos';
import { useSync } from '../store/sync';
import { useTema } from '../store/tema';
import {
  AccionRapida,
  Badge,
  Boton,
  Campo,
  Chip,
  ConfirmarModal,
  Encabezado,
  Gradiente,
  Grupo,
  Hoja,
  ListaVacia,
  PaletaColores,
  Pantalla,
  Superficie,
  Tarjeta,
} from '../components/UI';
import { fuentes, gradientes, paletaProductos, radius, sombraTarjeta, spacing, typography } from '../theme';
import {
  esUsuarioValido,
  generarUsuarioDesdeNombre,
  normalizarUsuario,
} from '../utils/usuario';
import { esPinValido } from '../utils/pin';
import { ContenidoCodigoRecuperacion } from '../components/CodigoRecuperacion';
import type { ParamListRaiz } from '../navigation';

type Vista = 'menu' | 'categorias' | 'usuarios' | 'negocio' | 'sync';

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
  iconoDerecha?: 'chevron-right' | 'logout' | 'file-download' | 'file-upload' | 'open-in-new';
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
  const sync = useSync();

  useEffect(() => {
    void refrescarEstadoSync(db);
  }, [db]);

  const [vista, setVista] = useState<Vista>('menu');
  const [exportar, setExportar] = useState<null | 'hoja'>(null);
  const [backup, setBackup] = useState<null | 'hoja'>(null);
  const [restore, setRestore] = useState<null | 'hoja' | 'confirmar'>(null);
  const [restoreArchivo, setRestoreArchivo] = useState<{ uri: string; nombre: string } | null>(null);
  const [restoreValidando, setRestoreValidando] = useState(false);
  const [restoreValidacion, setRestoreValidacion] = useState<{ valido: boolean; error?: string } | null>(null);
  const [seguridad, setSeguridad] = useState<null | 'pin' | 'codigo'>(null);

  if (vista === 'categorias') {
    return <CategoriasVista onAtras={() => setVista('menu')} />;
  }
  if (vista === 'usuarios') {
    return <UsuariosVista onAtras={() => setVista('menu')} />;
  }
  if (vista === 'negocio') {
    return <NegocioVista onAtras={() => setVista('menu')} />;
  }
  if (vista === 'sync') {
    return <SyncVista onAtras={() => setVista('menu')} />;
  }

  const esAdmin = usuario.rol === 'admin';

  return (
    <Pantalla>
      <Encabezado titulo="Ajustes" subtitulo="Administración del negocio" />
      <Superficie>
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: 110 }]}>
        <View
          style={[
            styles.perfil,
            {
              backgroundColor: colores.superficie,
              borderColor: colores.borde,
              ...sombraTarjeta(colores),
            },
          ]}
        >
          <View style={[styles.perfilAvatarAnillo, { backgroundColor: colores.primarioSuave }]}>
            <Gradiente colores={gradientes.primario} estilo={styles.perfilAvatar}>
              <Text style={styles.perfilAvatarTexto}>
                {usuario.nombre.charAt(0).toUpperCase()}
              </Text>
            </Gradiente>
            <View
              style={[
                styles.perfilAvatarBadge,
                { backgroundColor: colores.superficie, borderColor: colores.superficie },
              ]}
            >
              <MaterialIcons
                name={esAdmin ? 'verified' : 'person'}
                size={11}
                color={colores.primario}
              />
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.perfilNombre, { color: colores.texto }]} numberOfLines={1}>
              {usuario.nombre}
            </Text>
            <View style={styles.perfilMeta}>
              <Text
                style={[styles.perfilDetalle, { color: colores.textoSuave }]}
                numberOfLines={1}
              >
                @{usuario.usuario}
              </Text>
              <View style={[styles.perfilRol, { backgroundColor: colores.primarioSuave }]}>
                <Text style={[styles.perfilRolTexto, { color: colores.primario }]}>
                  {esAdmin ? 'Administrador' : 'Dependiente'}
                </Text>
              </View>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={18} color={colores.textoSuave} />
        </View>

        {esAdmin ? (
          <>
            <View style={styles.seccionTitulo}>
              <Text style={[styles.seccion, { color: colores.texto }]}>Gestión</Text>
              <Text style={[styles.seccionNota, { color: colores.textoSuave }]}>Catálogo y acceso</Text>
            </View>
            <View style={styles.acciones}>
              <AccionRapida
                icono="inventory-2"
                etiqueta="Productos"
                onPress={() => navigation.navigate('Productos')}
              />
              <AccionRapida
                icono="category"
                etiqueta="Categorías"
                onPress={() => setVista('categorias')}
              />
              <AccionRapida
                icono="people"
                etiqueta="Usuarios"
                onPress={() => setVista('usuarios')}
              />
            </View>
          </>
        ) : null}

        <Text style={[styles.seccion, { color: colores.textoSuave }]}>Apariencia</Text>
        <Grupo>
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
        </Grupo>

        <Text style={[styles.seccion, { color: colores.textoSuave }]}>Negocio</Text>
        <Grupo>
          <Fila
            icono={<MaterialIcons name="storefront" size={22} color={colores.advertencia} />}
            colorIcono={colores.advertencia}
            colorFondo={colores.advertenciaSuave}
            titulo="Nombre y moneda"
            sub="Datos que se muestran en la caja"
            onPress={() => setVista('negocio')}
          />
          <Fila
            icono={<MaterialIcons name="file-download" size={22} color={colores.info} />}
            colorIcono={colores.info}
            colorFondo={colores.infoSuave}
            titulo="Exportar ventas"
            sub="Genera un PDF con las ventas"
            iconoDerecha="file-download"
            onPress={() => setExportar('hoja')}
          />
        </Grupo>

        <Text style={[styles.seccion, { color: colores.textoSuave }]}>Datos</Text>
        <Grupo>
          <Fila
            icono={<MaterialIcons name="cloud-sync" size={22} color={colores.acento} />}
            colorIcono={colores.acento}
            colorFondo={colores.acentoSuave}
            titulo="Sincronización"
            sub={
              sync.pendientes > 0
                ? `${sync.pendientes} operación(es) pendiente(s)`
                : sync.fallidas > 0
                  ? `${sync.fallidas} con error`
                  : sync.ultimaSync
                    ? 'Todo al día'
                    : 'Configurar conexión con la nube'
            }
            onPress={() => setVista('sync')}
          />
          {esAdmin ? (
            <Fila
              icono={<MaterialIcons name="cloud-download" size={22} color={colores.exito} />}
              colorIcono={colores.exito}
              colorFondo={colores.exitoSuave}
              titulo="Backup de datos"
              sub="Exportar copia de seguridad"
              iconoDerecha="file-download"
              onPress={() => setBackup('hoja')}
            />
          ) : null}
          {esAdmin ? (
            <Fila
              icono={<MaterialIcons name="cloud-upload" size={22} color={colores.advertencia} />}
              colorIcono={colores.advertencia}
              colorFondo={colores.advertenciaSuave}
              titulo="Restaurar datos"
              sub="Importar copia de seguridad"
              iconoDerecha="file-upload"
              onPress={() => setRestore('hoja')}
            />
          ) : null}
        </Grupo>

        <Text style={[styles.seccion, { color: colores.textoSuave }]}>Sesión</Text>
        <Grupo>
          <Fila
            icono={<MaterialIcons name="lock-reset" size={22} color={colores.acento} />}
            colorIcono={colores.acento}
            colorFondo={colores.acentoSuave}
            titulo="Cambiar mi PIN"
            sub="Actualiza tu contraseña de acceso"
            onPress={() => setSeguridad('pin')}
          />
          <Fila
            icono={<MaterialIcons name="key" size={22} color={colores.info} />}
            colorIcono={colores.info}
            colorFondo={colores.infoSuave}
            titulo="Código de recuperación"
            sub="Genera una llave para recuperar tu PIN"
            onPress={() => setSeguridad('codigo')}
          />
          <Fila
            icono={<MaterialIcons name="logout" size={22} color={colores.peligro} />}
            colorIcono={colores.peligro}
            colorFondo={colores.peligroSuave}
            titulo="Cerrar sesión"
            sub="Volver al inicio de sesión"
            iconoDerecha="logout"
            peligro
            onPress={() =>
              mostrarAviso('Cerrar sesión', '¿Seguro que deseas salir?', [
                { texto: 'Cancelar', estilo: 'cancel' },
                { texto: 'Salir', estilo: 'peligro', onPress: cerrar },
              ])
            }
          />
        </Grupo>

        <View style={styles.pie}>
          <View style={[styles.piePunto, { backgroundColor: colores.primario }]} />
          <Text style={[styles.version, { color: colores.textoSuave }]}>MiCaja · v1.0.0</Text>
        </View>
      </ScrollView>
      </Superficie>

      <ExportarVentasHoja
        visible={exportar === 'hoja'}
        onCerrar={() => setExportar(null)}
      />

      <BackupHoja
        visible={backup === 'hoja'}
        onCerrar={() => setBackup(null)}
      />

      <RestoreHoja
        visible={restore !== null}
        onCerrar={() => {
          setRestore(null);
          setRestoreArchivo(null);
          setRestoreValidacion(null);
        }}
        onSeleccionar={async () => {
          setRestore('hoja');
          setRestoreValidando(true);
          const archivo = await seleccionarArchivoRestore();
          if (archivo) {
            setRestoreArchivo(archivo);
            const validacion = await validarArchivoRestore(archivo.uri, archivo.nombre);
            setRestoreValidacion(validacion);
            if (validacion.valido) {
              setRestore('confirmar');
            }
          }
          setRestoreValidando(false);
        }}
        archivo={restoreArchivo}
        validando={restoreValidando}
        validacion={restoreValidacion}
        onConfirmarRestore={async () => {
          if (!restoreArchivo) return;
          setRestoreValidando(true);
          const resultado = await restaurarBackup(db, restoreArchivo.uri, restoreArchivo.nombre);
          setRestoreValidando(false);
          if (resultado.exito) {
            mostrarAviso('Restaurado', 'La base de datos fue restaurada. La sesión se cerrará.');
            setTimeout(() => cerrar(), 1500);
          } else {
            mostrarAviso('Error', resultado.error || 'No se pudo restaurar el backup.');
          }
        }}
      />

      <SeguridadCuentaHoja
        visible={seguridad !== null}
        modo={seguridad ?? 'pin'}
        onCerrar={() => setSeguridad(null)}
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
    color: '#3F3FB0',
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
        subtitulo={`${categorias.length} ${categorias.length === 1 ? 'categoría' : 'categorías'}`}
        onAtras={onAtras}
        derecha={
          <Pressable
            onPress={() => setForm({ abierto: true, editar: null, nombre: '', color: '#3F3FB0' })}
            style={({ pressed }) => [
              styles.fab,
              { backgroundColor: '#FFFFFF', ...sombraTarjeta(colores) },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <MaterialIcons name="add" size={20} color={colores.primario} />
          </Pressable>
        }
      />
      <Superficie>
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
      </Superficie>

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

function SeguridadCuentaHoja({
  visible,
  modo,
  onCerrar,
}: {
  visible: boolean;
  modo: 'pin' | 'codigo';
  onCerrar: () => void;
}) {
  const db = useSQLiteContext();
  const sesion = useSesion((s) => s.usuario)!;
  const { colores } = useTema();
  const mostrarAviso = useAvisos((s) => s.mostrar);

  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [codigoGenerado, setCodigoGenerado] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPinActual('');
    setPinNuevo('');
    setConfirmacion('');
    setError(null);
    setGuardando(false);
    setCodigoGenerado(null);
  }, [visible, modo]);

  const esPin = modo === 'pin';

  function mensajeFallo(resultado: {
    motivo: 'pin' | 'bloqueado' | 'inactivo' | 'nuevo_pin_invalido';
    intentosRestantes?: number;
    bloqueadoHasta?: string;
  }): string {
    if (resultado.motivo === 'bloqueado') {
      const minutos = Math.max(
        1,
        Math.ceil((Date.parse(resultado.bloqueadoHasta ?? '') - Date.now()) / 60000)
      );
      return `Demasiados intentos. Espera ${minutos} minuto(s) e intenta de nuevo.`;
    }
    if (resultado.motivo === 'inactivo') {
      return 'Tu usuario está desactivado. Habla con un administrador.';
    }
    if (resultado.motivo === 'nuevo_pin_invalido') {
      return 'La nueva contraseña debe tener exactamente 4 dígitos.';
    }
    return resultado.intentosRestantes && resultado.intentosRestantes > 0
      ? `PIN actual incorrecto. Te quedan ${resultado.intentosRestantes} intento(s).`
      : 'PIN actual incorrecto.';
  }

  async function guardar() {
    if (guardando) return;
    if (!/^\d{4}$/.test(pinActual)) {
      setError('Escribe tu PIN actual de 4 dígitos.');
      return;
    }
    if (esPin) {
      if (!esPinValido(pinNuevo)) {
        setError('La nueva contraseña debe tener exactamente 4 dígitos.');
        return;
      }
      if (pinNuevo !== confirmacion) {
        setError('Las dos contraseñas nuevas no coinciden.');
        return;
      }
    }

    setError(null);
    setGuardando(true);

    try {
      if (esPin) {
        const resultado = await cambiarPinPropio(db, sesion.id, pinActual, pinNuevo);
        if (!resultado.ok) {
          setError(mensajeFallo(resultado));
          setPinActual('');
          return;
        }
        try {
          await encolarUsuarioUpsert(db, sesion.id);
        } catch {
          // El cambio local ya está hecho; se reintenta en el próximo guardado.
        }
        mostrarAviso('PIN actualizado', 'Tu nueva contraseña ya está activa.');
        onCerrar();
        return;
      }

      const resultado = await generarCodigoRecuperacionPropio(db, sesion.id, pinActual);
      if (!resultado.ok) {
        setError(mensajeFallo(resultado));
        setPinActual('');
        return;
      }
      setCodigoGenerado(resultado.codigo);
    } catch {
      setError('No se pudo completar la operación. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja
      visible={visible}
      onCerrar={onCerrar}
      titulo={esPin ? 'Cambiar mi PIN' : 'Código de recuperación'}
      subtitulo={
        esPin
          ? 'Confirma tu PIN actual y elige uno nuevo'
          : 'Una llave de repuesto para cuando olvides tu PIN'
      }
      pie={
        codigoGenerado ? (
          <Boton titulo="Listo" icono="check" tamanio="lg" onPress={onCerrar} />
        ) : (
          <Boton
            titulo={esPin ? 'Guardar nuevo PIN' : 'Generar código'}
            icono={esPin ? 'save' : 'key'}
            tamanio="lg"
            cargando={guardando}
            onPress={guardar}
          />
        )
      }
    >
      {codigoGenerado ? (
        <ContenidoCodigoRecuperacion nombre={sesion.nombre} codigo={codigoGenerado} />
      ) : (
        <>
          <Text style={[styles.formAyuda, { color: colores.textoSuave }]}>
            {esPin
              ? 'Si no recuerdas tu PIN actual, cierra esta hoja y usa “¿Olvidaste tu PIN?” en la pantalla de acceso.'
              : 'Se mostrará una sola vez. Si ya tenías un código, dejará de funcionar y se reemplazará por este.'}
          </Text>

          {error ? (
            <View style={[styles.seguridadError, { backgroundColor: colores.peligroSuave }]}>
              <MaterialIcons name="error-outline" size={18} color={colores.peligro} />
              <Text style={[styles.seguridadErrorTexto, { color: colores.peligro }]}>
                {error}
              </Text>
            </View>
          ) : null}

          <Campo
            etiqueta="PIN actual"
            valor={pinActual}
            onChange={(texto) => {
              setPinActual(texto.replace(/\D/g, '').slice(0, 4));
              setError(null);
            }}
            icono="lock-outline"
            teclado="numeric"
            seguro
            maxLength={4}
            autoComplete="current-password"
          />

          {esPin ? (
            <>
              <Campo
                etiqueta="Nuevo PIN (4 dígitos)"
                valor={pinNuevo}
                onChange={(texto) => {
                  setPinNuevo(texto.replace(/\D/g, '').slice(0, 4));
                  setError(null);
                }}
                icono="lock"
                teclado="numeric"
                seguro
                maxLength={4}
                autoComplete="new-password"
              />
              <Campo
                etiqueta="Confirmar nuevo PIN"
                valor={confirmacion}
                onChange={(texto) => {
                  setConfirmacion(texto.replace(/\D/g, '').slice(0, 4));
                  setError(null);
                }}
                icono="lock"
                teclado="numeric"
                seguro
                maxLength={4}
                autoComplete="new-password"
              />
            </>
          ) : (
            <Text style={[styles.formAyuda, { color: colores.textoSuave }]}>
              El código tiene 12 caracteres y no usa letras I, O ni los números 0 y 1.
              Anótalo en un lugar seguro.
            </Text>
          )}
        </>
      )}
    </Hoja>
  );
}

function UsuariosVista({ onAtras }: { onAtras: () => void }) {
  const db = useSQLiteContext();
  const sesion = useSesion((s) => s.usuario)!;
  const { colores } = useTema();
  const mostrarAviso = useAvisos((s) => s.mostrar);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [form, setForm] = useState<{
    abierto: boolean;
    editar: Usuario | null;
    nombre: string;
    usuario: string;
    usuarioTocado: boolean;
    rol: 'admin' | 'dependiente';
    pin: string;
    activo: boolean;
  }>({
    abierto: false,
    editar: null,
    nombre: '',
    usuario: '',
    usuarioTocado: false,
    rol: 'dependiente',
    pin: '',
    activo: true,
  });
  const [borrando, setBorrando] = useState<Usuario | null>(null);
  const [codigoNuevo, setCodigoNuevo] = useState<{ nombre: string; codigo: string } | null>(null);

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
    const usuarioLimpio = normalizarUsuario(form.usuario);
    if (!esUsuarioValido(usuarioLimpio)) {
      mostrarAviso(
        'Usuario inválido',
        'El usuario debe tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo.'
      );
      return;
    }
    if (await existeNombreUsuario(db, usuarioLimpio, form.editar?.id)) {
      mostrarAviso('Usuario en uso', 'Ese nombre de usuario ya está tomado.');
      return;
    }
    const editar = form.editar;
    const pinNuevo = form.pin.trim();
    if (!editar && !/^\d{4}$/.test(pinNuevo)) {
      mostrarAviso('Contraseña inválida', 'La contraseña debe tener exactamente 4 dígitos.');
      return;
    }
    if (editar && pinNuevo !== '' && !/^\d{4}$/.test(pinNuevo)) {
      mostrarAviso('Contraseña inválida', 'La nueva contraseña debe tener exactamente 4 dígitos.');
      return;
    }
    if (editar && editar.rol === 'admin' && form.rol === 'dependiente' && admins.length <= 1) {
      mostrarAviso('No permitido', 'Debe existir al menos un administrador.');
      return;
    }
    const datos = {
      nombre: form.nombre.trim(),
      usuario: usuarioLimpio,
      rol: form.rol,
      activo: form.activo,
    };
    let codigoNuevoUsuario: { nombre: string; codigo: string } | null = null;
    if (editar) {
      await actualizarUsuario(db, { ...datos, id: editar.id }, pinNuevo || undefined);
    } else {
      const resultado = await crearUsuario(db, { ...datos, pin: pinNuevo });
      codigoNuevoUsuario = {
        nombre: datos.nombre,
        codigo: resultado.codigoRecuperacion,
      };
    }
    setForm((f) => ({ ...f, abierto: false }));
    await cargar();
    if (codigoNuevoUsuario) setCodigoNuevo(codigoNuevoUsuario);
  }

  async function generarCodigo(u: Usuario) {
    try {
      const codigo = await establecerCodigoRecuperacion(db, u.id);
      if (!codigo) {
        mostrarAviso('Error', 'No se pudo generar el código de recuperación.');
        return;
      }
      setForm((f) => ({ ...f, abierto: false }));
      setCodigoNuevo({ nombre: u.nombre, codigo });
      await cargar();
    } catch {
      mostrarAviso('Error', 'No se pudo generar el código de recuperación.');
    }
  }

  function pedirCodigo(u: Usuario) {
    if (u.tieneCodigoRecuperacion) {
      mostrarAviso(
        'Regenerar código',
        `El código anterior de ${u.nombre} dejará de funcionar. ¿Generar uno nuevo?`,
        [
          { texto: 'Cancelar', estilo: 'cancel' },
          {
            texto: 'Regenerar',
            estilo: 'peligro',
            onPress: () => {
              void generarCodigo(u);
            },
          },
        ]
      );
      return;
    }
    void generarCodigo(u);
  }

  async function desbloquear(u: Usuario) {
    await desbloquearUsuario(db, u.id);
    await cargar();
    mostrarAviso('Desbloqueado', `${u.nombre} puede volver a intentar entrar.`);
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
        subtitulo={`${usuarios.length} ${usuarios.length === 1 ? 'usuario' : 'usuarios'}`}
        onAtras={onAtras}
        derecha={
          <Pressable
            onPress={() =>
              setForm({
                abierto: true,
                editar: null,
                nombre: '',
                usuario: '',
                usuarioTocado: false,
                rol: 'dependiente',
                pin: '',
                activo: true,
              })
            }
            style={({ pressed }) => [
              styles.fab,
              { backgroundColor: '#FFFFFF', ...sombraTarjeta(colores) },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <MaterialIcons name="add" size={20} color={colores.primario} />
          </Pressable>
        }
      />
      <Superficie>
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
              <Text style={[styles.usuarioAlias, { color: colores.textoSuave }]}>@{u.usuario}</Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <Badge
                  texto={u.rol === 'admin' ? 'Admin' : 'Dependiente'}
                  color={u.rol === 'admin' ? colores.primarioSuave : colores.infoSuave}
                  colorTexto={u.rol === 'admin' ? colores.primario : colores.info}
                />
                {u.tienePin === false ? (
                  <Badge
                    texto="Sin PIN aquí"
                    color={colores.advertenciaSuave}
                    colorTexto={colores.advertencia}
                  />
                ) : null}
                {u.bloqueado ? (
                  <Badge
                    texto="Bloqueado"
                    color={colores.peligroSuave}
                    colorTexto={colores.peligro}
                  />
                ) : null}
              </View>
            </View>
            {u.bloqueado ? (
              <Pressable
                onPress={() => {
                  void desbloquear(u);
                }}
                hitSlop={8}
                style={{ padding: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Desbloquear a ${u.nombre}`}
              >
                <MaterialIcons name="lock-open" size={20} color={colores.advertencia} />
              </Pressable>
            ) : null}
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
              onPress={() =>
                setForm({
                  abierto: true,
                  editar: u,
                  nombre: u.nombre,
                  usuario: u.usuario,
                  usuarioTocado: true,
                  rol: u.rol,
                  pin: '',
                  activo: u.activo,
                })
              }
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
      </Superficie>

      <Hoja
        visible={form.abierto}
        onCerrar={() => setForm((f) => ({ ...f, abierto: false }))}
        titulo={form.editar ? 'Editar usuario' : 'Nuevo usuario'}
        pie={<Boton titulo="Guardar" icono="save" tamanio="lg" onPress={guardar} />}
      >
        <Campo
          etiqueta="Nombre"
          valor={form.nombre}
          onChange={(texto) =>
            setForm((f) => ({
              ...f,
              nombre: texto,
              usuario: f.usuarioTocado ? f.usuario : generarUsuarioDesdeNombre(texto),
            }))
          }
          placeholder="Ej.: María"
          autoFocus
        />
        <Campo
          etiqueta="Usuario de acceso"
          valor={form.usuario}
          onChange={(texto) =>
            setForm((f) => ({
              ...f,
              usuarioTocado: true,
              usuario: texto.replace(/\s/g, '').toLowerCase(),
            }))
          }
          placeholder="Ej.: maria"
          icono="alternate-email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          maxLength={20}
        />
        <Text style={[styles.formAyuda, { color: colores.textoSuave }]}>
          Con este usuario y su contraseña se inicia sesión.
        </Text>
        <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Rol</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Chip etiqueta="Dependiente" icono="storefront" activo={form.rol === 'dependiente'} onPress={() => setForm((f) => ({ ...f, rol: 'dependiente' }))} />
          <Chip etiqueta="Administrador" icono="admin-panel-settings" activo={form.rol === 'admin'} color={colores.primario} onPress={() => setForm((f) => ({ ...f, rol: 'admin' }))} />
        </View>
        <Campo
          etiqueta={form.editar ? 'Nueva contraseña (opcional)' : 'Contraseña (4 dígitos)'}
          valor={form.pin}
          onChange={(texto) => setForm((f) => ({ ...f, pin: texto.replace(/\D/g, '').slice(0, 4) }))}
          teclado="numeric"
          seguro
          maxLength={4}
          placeholder={form.editar ? 'Dejar vacío para conservar' : '••••'}
          autoComplete="new-password"
        />
        {form.editar ? (
          <Text
            style={{
              fontSize: typography.micro,
              fontFamily: fuentes.regular,
              color: form.editar.tienePin === false ? colores.advertencia : colores.textoSuave,
              marginTop: -8,
              marginBottom: spacing.md,
            }}
          >
            {form.editar.tienePin === false
              ? 'Esta cuenta llegó por sincronización y aún no tiene PIN en este dispositivo. Asigna uno para que pueda entrar aquí; su PIN en otros dispositivos no cambia.'
              : 'Si dejas la contraseña vacía se conserva la actual. Al cambiarla también se desbloquea el usuario.'}
          </Text>
        ) : null}
        {form.editar ? (
          <Pressable
            onPress={() => pedirCodigo(form.editar!)}
            style={({ pressed }) => [
              styles.accionCodigo,
              {
                backgroundColor: colores.acentoSuave,
                borderColor: colores.borde,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            <MaterialIcons name="key" size={20} color={colores.acento} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.accionCodigoTexto, { color: colores.texto }]}>
                {form.editar.tieneCodigoRecuperacion
                  ? 'Regenerar código de recuperación'
                  : 'Generar código de recuperación'}
              </Text>
              <Text style={[styles.accionCodigoSub, { color: colores.textoSuave }]}>
                {form.editar.tieneCodigoRecuperacion
                  ? 'El código actual dejará de funcionar.'
                  : 'Para que pueda recuperar su PIN si lo olvida.'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colores.textoSuave} />
          </Pressable>
        ) : null}
        <View style={styles.switchFila}>
          <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Usuario activo</Text>
          <Switch
            value={form.activo}
            onValueChange={(v) => setForm((f) => ({ ...f, activo: v }))}
            trackColor={{ true: colores.acento, false: colores.borde }}
          />
        </View>
      </Hoja>

      <Hoja
        visible={!!codigoNuevo}
        onCerrar={() => setCodigoNuevo(null)}
        titulo="Código de recuperación"
        subtitulo="Guárdalo antes de cerrar esta ventana"
        pie={<Boton titulo="Listo" icono="check" tamanio="lg" onPress={() => setCodigoNuevo(null)} />}
      >
        {codigoNuevo ? (
          <ContenidoCodigoRecuperacion
            nombre={codigoNuevo.nombre}
            codigo={codigoNuevo.codigo}
          />
        ) : null}
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
      <Superficie>
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
      </Superficie>
    </Pantalla>
  );
}

function SyncVista({ onAtras }: { onAtras: () => void }) {
  const db = useSQLiteContext();
  const { colores } = useTema();
  const mostrarAviso = useAvisos((s) => s.mostrar);
  const sync = useSync();
  const esAdmin = useSesion((s) => s.usuario?.rol === 'admin');

  const [url, setUrl] = useState('');
  const [codigo, setCodigo] = useState('');
  const [activado, setActivado] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [activando, setActivando] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hojaInvitacion, setHojaInvitacion] = useState(false);
  const [rolInvitacion, setRolInvitacion] = useState<'dependiente' | 'admin'>('dependiente');
  const [creandoInvitacion, setCreandoInvitacion] = useState(false);
  const [codigoInvitacion, setCodigoInvitacion] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([leerUrlServidor(db), leerTokenDispositivo(db)])
      .then(([direccion, token]) => {
        setUrl(direccion);
        setActivado(!!token);
      })
      .catch(() => setActivado(false));
    void refrescarEstadoSync(db);
  }, [db]);

  async function generarInvitacion() {
    if (creandoInvitacion) return;
    setCreandoInvitacion(true);
    setError(null);
    try {
      const respuesta = await crearInvitacion(db, { rol: rolInvitacion });
      setCodigoInvitacion(respuesta.codigo);
      setError(null);
    } catch (fallo) {
      setError(
        fallo instanceof Error ? fallo.message : 'No se pudo crear la invitación.'
      );
    } finally {
      setCreandoInvitacion(false);
    }
  }

  function cerrarHojaInvitacion() {
    setHojaInvitacion(false);
    setCodigoInvitacion(null);
    setRolInvitacion('dependiente');
  }

  async function guardarUrl() {
    const limpia = normalizarUrlServidor(url);
    await guardarSetting(db, CLAVE_URL_SERVIDOR, limpia);
    setUrl(limpia);
    mostrarAviso('Servidor guardado', 'La dirección se usará en la próxima sincronización.');
  }

  async function sincronizarAhora() {
    if (guardando) return;
    setError(null);
    setGuardando(true);
    try {
      const resumen = await ejecutarSync(db);
      mostrarAviso(
        'Sincronización completada',
        `${resumen.aplicadas} operación(es) enviadas y ${resumen.cambios} cambio(s) recibidos.`
      );
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo sincronizar.');
    } finally {
      setGuardando(false);
      await refrescarEstadoSync(db);
    }
  }

  async function reintentar() {
    if (reintentando) return;
    setError(null);
    setReintentando(true);
    try {
      const resumen = await reintentarRechazadasSync(db);
      mostrarAviso(
        'Operaciones reenviadas',
        resumen.rechazadas > 0
          ? `${resumen.aplicadas} aplicada(s); ${resumen.rechazadas} siguieron con error.`
          : `${resumen.aplicadas} aplicada(s) en el servidor.`
      );
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo reintentar.');
    } finally {
      setReintentando(false);
      await refrescarEstadoSync(db);
    }
  }

  async function recargarDesdeLaNube() {
    if (recargando) return;
    setError(null);
    setRecargando(true);
    try {
      await reiniciarDescarga(db);
      const resumen = await ejecutarSync(db);
      mostrarAviso(
        'Datos recargados',
        `${resumen.cambios} cambio(s) descargados desde la nube.`
      );
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo recargar.');
    } finally {
      setRecargando(false);
      await refrescarEstadoSync(db);
    }
  }

  async function activar() {
    if (activando) return;
    const limpio = codigo.trim().toUpperCase();
    if (!/^MICAJA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(limpio)) {
      setError('Escribe un código válido con el formato MICAJA-XXXX-XXXX-XXXX.');
      return;
    }

    setError(null);
    setActivando(true);
    try {
      const nombre = await nombreDispositivoPorDefecto(db);
      const respuesta = await activarConCodigo(db, limpio, nombre);
      setActivado(true);
      setCodigo('');
      await refrescarEstadoSync(db);
      mostrarAviso('Dispositivo activado', `${respuesta.empresa.nombre} ya puede sincronizarse.`);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo activar el dispositivo.');
    } finally {
      setActivando(false);
    }
  }

  const licencia = sync.licencia;
  const requiereActivacion =
    licencia?.estado === 'invalida' ||
    licencia?.estado === 'vencida' ||
    licencia?.estado === 'sin_licencia';
  const etiquetaLicencia =
    licencia?.estado === 'activa'
      ? 'Licencia activa'
      : licencia?.estado === 'gracia'
        ? 'En período de gracia'
        : licencia?.estado === 'vencida'
          ? 'Licencia vencida'
          : licencia?.estado === 'invalida'
            ? 'Licencia inválida'
            : 'Dispositivo sin activar';
  const colorLicencia =
    licencia?.estado === 'activa'
      ? colores.exito
      : licencia?.estado === 'gracia'
        ? colores.advertencia
        : licencia?.estado === 'vencida' || licencia?.estado === 'invalida'
          ? colores.peligro
          : colores.advertencia;

  return (
    <Pantalla>
      <Encabezado
        titulo="Sincronización"
        subtitulo="Nube, respaldo y licencia"
        onAtras={onAtras}
      />
      <Superficie>
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: 60 }]}>
        <Tarjeta estilo={{ marginTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.filaTitulo, { color: colores.texto }]}>Estado</Text>
              <Text style={[styles.filaSub, { color: colores.textoSuave }]}>
                {sync.pendientes} pendiente(s) · {sync.fallidas} con error
              </Text>
              {sync.ultimaSync ? (
                <Text style={[styles.filaSub, { color: colores.textoSuave }]}>
                  Última sync: {new Date(sync.ultimaSync).toLocaleString()}
                </Text>
              ) : null}
            </View>
            <Badge
              texto={activado ? 'Activado' : 'Sin activar'}
              color={activado ? colores.exitoSuave : colores.advertenciaSuave}
              colorTexto={activado ? colores.exito : colores.advertencia}
            />
          </View>

          {error ? (
            <Text style={{ color: colores.peligro, fontFamily: fuentes.medium, fontSize: typography.cuerpoChico, marginTop: spacing.md }}>
              {error}
            </Text>
          ) : null}

          <Boton
            titulo="Sincronizar ahora"
            icono="sync"
            tamanio="lg"
            cargando={guardando}
            bloqueado={!activado}
            onPress={sincronizarAhora}
            estilo={{ marginTop: spacing.lg }}
          />

          <Boton
            titulo="Recargar datos desde la nube"
            icono="cloud-download"
            variante="secundario"
            tamanio="sm"
            cargando={recargando}
            bloqueado={!activado}
            onPress={recargarDesdeLaNube}
            estilo={{ marginTop: spacing.sm }}
          />

          {sync.fallidas > 0 ? (
            <Boton
              titulo={`Reintentar las ${sync.fallidas} con error`}
              icono="refresh"
              variante="secundario"
              tamanio="sm"
              cargando={reintentando}
              bloqueado={!activado}
              onPress={reintentar}
              estilo={{ marginTop: spacing.sm }}
            />
          ) : null}
        </Tarjeta>

        <Text style={[styles.seccion, { color: colores.textoSuave }]}>Servidor</Text>
        <Tarjeta>
          <Campo
            etiqueta="Dirección del servidor"
            valor={url}
            onChange={setUrl}
            placeholder="http://192.168.1.10:4000"
            icono="dns"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Boton
            titulo="Guardar dirección"
            icono="save"
            variante="secundario"
            tamanio="sm"
            onPress={guardarUrl}
          />
        </Tarjeta>

        {activado === false ? (
          <>
            <Text style={[styles.seccion, { color: colores.textoSuave }]}>Activar dispositivo</Text>
            <Tarjeta>
              <Campo
                etiqueta="Código de activación"
                valor={codigo}
                onChange={(texto) => setCodigo(texto.toUpperCase())}
                placeholder="MICAJA-XXXX-XXXX-XXXX"
                icono="vpn-key"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={23}
              />
              <Boton
                titulo="Activar"
                icono="phonelink-lock"
                variante="acento"
                tamanio="lg"
                cargando={activando}
                onPress={activar}
              />
            </Tarjeta>
          </>
        ) : (
          <>
            <Text style={[styles.seccion, { color: colores.textoSuave }]}>Licencia</Text>
            <Tarjeta>
              <Badge
                texto={etiquetaLicencia}
                color={colorLicencia + '1A'}
                colorTexto={colorLicencia}
              />
              {licencia?.payload ? (
                <Text style={{ color: colores.textoSuave, fontFamily: fuentes.regular, fontSize: typography.cuerpoChico, marginTop: spacing.sm }}>
                  Plan {licencia.payload.plan} · vence el{' '}
                  {new Date(licencia.payload.exp * 1000).toLocaleDateString()}
                </Text>
              ) : (
                <Text style={{ color: colores.textoSuave, fontFamily: fuentes.regular, fontSize: typography.cuerpoChico, marginTop: spacing.sm }}>
                  Sin licencia activada. Conecta a Internet y activa este dispositivo con un
                  código para poder vender.
                </Text>
              )}
            </Tarjeta>

            {requiereActivacion ? (
              <>
                <Text style={[styles.seccion, { color: colores.textoSuave }]}>
                  {activado ? 'Activar licencia' : 'Activar dispositivo'}
                </Text>
                <Tarjeta>
                  <Campo
                    etiqueta="Código de activación"
                    valor={codigo}
                    onChange={(texto) => setCodigo(texto.toUpperCase())}
                    placeholder="MICAJA-XXXX-XXXX-XXXX"
                    icono="vpn-key"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={23}
                  />
                  <Boton
                    titulo={activado ? 'Activar licencia' : 'Activar'}
                    icono="phonelink-lock"
                    variante="acento"
                    tamanio="lg"
                    cargando={activando}
                    onPress={activar}
                  />
                </Tarjeta>
              </>
            ) : null}

            {esAdmin ? (
              <>
                <Text style={[styles.seccion, { color: colores.textoSuave }]}>Acceso de trabajadores</Text>
                <Tarjeta>
                  <Text style={[styles.filaSub, { color: colores.textoSuave }]}>
                    Genera un código para que otra persona entre a este negocio con su propia cuenta.
                  </Text>
                  <Boton
                    titulo="Invitar trabajador"
                    icono="person-add"
                    tamanio="md"
                    onPress={() => {
                      setCodigoInvitacion(null);
                      setRolInvitacion('dependiente');
                      setHojaInvitacion(true);
                    }}
                    estilo={{ marginTop: spacing.sm }}
                  />
                </Tarjeta>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      </Superficie>

      <Hoja
        visible={hojaInvitacion}
        onCerrar={cerrarHojaInvitacion}
        titulo="Invitar trabajador"
        subtitulo="Genera un código para que el trabajador active su propio dispositivo"
      >
        {codigoInvitacion ? (
          <>
            <View
              style={[
                styles.invitacionCodigo,
                { backgroundColor: colores.exitoSuave, borderColor: colores.exito },
              ]}
            >
              <Text style={[styles.invitacionCodigoTexto, { color: colores.exito }]}>
                {codigoInvitacion}
              </Text>
              <Text style={[styles.filaSub, { color: colores.textoSuave, marginTop: spacing.xs }]}>
                Se muestra una sola vez. El trabajador lo introduce en su instalación de
                MiCaja para unirse al negocio.
              </Text>
            </View>
            <Boton titulo="Listo" tamanio="lg" onPress={cerrarHojaInvitacion} />
          </>
        ) : (
          <>
            <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Rol del trabajador</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Chip
                etiqueta="Dependiente"
                icono="storefront"
                activo={rolInvitacion === 'dependiente'}
                onPress={() => setRolInvitacion('dependiente')}
              />
              <Chip
                etiqueta="Administrador"
                icono="manage-accounts"
                activo={rolInvitacion === 'admin'}
                onPress={() => setRolInvitacion('admin')}
              />
            </View>
            <Boton
              titulo="Generar código"
              icono="vpn-key"
              tamanio="lg"
              cargando={creandoInvitacion}
              onPress={generarInvitacion}
              estilo={{ marginTop: spacing.lg }}
            />
          </>
        )}
      </Hoja>

    </Pantalla>
  );
}

function BackupHoja({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  const db = useSQLiteContext();
  const { colores } = useTema();
  const mostrarAviso = useAvisos((s) => s.mostrar);
  const [cargando, setCargando] = useState(false);

  async function exportar() {
    if (cargando) return;
    setCargando(true);
    try {
      const ok = await exportarBackup(db);
      if (ok) {
        mostrarAviso('Backup creado', 'El archivo de backup se compartió correctamente.');
        onCerrar();
      } else {
        mostrarAviso('No disponible', 'El intercambio no está disponible en este dispositivo.');
      }
    } catch {
      mostrarAviso('Error', 'No se pudo crear el backup.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <Hoja
      visible={visible}
      onCerrar={onCerrar}
      titulo="Backup de datos"
      subtitulo="Exportar una copia de seguridad de tu base de datos"
      pie={
        <Boton
          titulo="Crear backup"
          icono="cloud-download"
          variante="acento"
          tamanio="lg"
          cargando={cargando}
          onPress={exportar}
        />
      }
    >
      <View style={[styles.backupInfo, { backgroundColor: colores.exitoSuave, borderColor: colores.exito }]}>
        <MaterialIcons name="info-outline" size={20} color={colores.exito} />
        <Text style={[styles.backupInfoTexto, { color: colores.texto }]}>
          Se exportará una copia completa de la base de datos con todos los datos: productos, ventas, usuarios y configuración.
        </Text>
      </View>
      <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>El backup incluye:</Text>
      <View style={{ gap: spacing.xs }}>
        {['Productos y categorías', 'Historial de ventas', 'Usuarios y turnos', 'Configuración del negocio'].map((item) => (
          <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <MaterialIcons name="check-circle" size={16} color={colores.exito} />
            <Text style={{ fontSize: typography.cuerpoChico, color: colores.texto }}>{item}</Text>
          </View>
        ))}
      </View>
    </Hoja>
  );
}

function RestoreHoja({
  visible,
  onCerrar,
  onSeleccionar,
  archivo,
  validando,
  validacion,
  onConfirmarRestore,
}: {
  visible: boolean;
  onCerrar: () => void;
  onSeleccionar: () => void;
  archivo: { uri: string; nombre: string } | null;
  validando: boolean;
  validacion: { valido: boolean; error?: string } | null;
  onConfirmarRestore: () => void;
}) {
  const { colores } = useTema();

  return (
    <Hoja
      visible={visible}
      onCerrar={onCerrar}
      titulo="Restaurar datos"
      subtitulo="Importar un backup anterior"
      pie={
        !archivo ? (
          <Boton
            titulo="Seleccionar archivo"
            icono="file-upload"
            variante="acento"
            tamanio="lg"
            cargando={validando}
            onPress={onSeleccionar}
          />
        ) : validacion?.valido ? (
          <Boton
            titulo="Restaurar backup"
            icono="cloud-upload"
            variante="peligro"
            tamanio="lg"
            cargando={validando}
            onPress={onConfirmarRestore}
          />
        ) : (
          <Boton
            titulo="Intentar de nuevo"
            icono="refresh"
            variante="acento"
            tamanio="lg"
            onPress={onSeleccionar}
          />
        )
      }
    >
      {!archivo ? (
        <>
          <View style={[styles.backupInfo, { backgroundColor: colores.peligroSuave, borderColor: colores.peligro }]}>
            <MaterialIcons name="warning" size={20} color={colores.peligro} />
            <Text style={[styles.backupInfoTexto, { color: colores.texto }]}>
              Esta acción reemplazará TODOS los datos actuales con los del backup. Esta acción no se puede deshacer.
            </Text>
          </View>
          <Text style={[styles.formEtiqueta, { color: colores.textoSuave }]}>Se restaurarán:</Text>
          <View style={{ gap: spacing.xs }}>
            {['Productos y categorías', 'Historial de ventas', 'Usuarios y turnos', 'Configuración del negocio'].map((item) => (
              <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <MaterialIcons name="warning" size={16} color={colores.advertencia} />
                <Text style={{ fontSize: typography.cuerpoChico, color: colores.texto }}>{item}</Text>
              </View>
            ))}
          </View>
        </>
      ) : validando ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <ActivityIndicator size="large" color={colores.primario} />
          <Text style={{ marginTop: spacing.md, color: colores.textoSuave }}>Validando archivo...</Text>
        </View>
      ) : validacion?.valido ? (
        <View style={{ gap: spacing.md }}>
          <View style={[styles.backupInfo, { backgroundColor: colores.exitoSuave, borderColor: colores.exito }]}>
            <MaterialIcons name="check-circle" size={20} color={colores.exito} />
            <Text style={[styles.backupInfoTexto, { color: colores.texto }]}>
              Archivo válido: {archivo.nombre}
            </Text>
          </View>
          <View style={[styles.backupInfo, { backgroundColor: colores.peligroSuave, borderColor: colores.peligro }]}>
            <MaterialIcons name="warning" size={20} color={colores.peligro} />
            <Text style={[styles.backupInfoTexto, { color: colores.texto }]}>
              Se cerrará la sesión automáticamente después de restaurar. Asegúrate de que el backup es correcto.
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.backupInfo, { backgroundColor: colores.peligroSuave, borderColor: colores.peligro }]}>
          <MaterialIcons name="error" size={20} color={colores.peligro} />
          <Text style={[styles.backupInfoTexto, { color: colores.texto }]}>
            {validacion?.error || 'Archivo no válido'}
          </Text>
        </View>
      )}
    </Hoja>
  );
}

const styles = StyleSheet.create({
  contenido: { paddingHorizontal: spacing.lg },
  usuarioTarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  usuarioAlias: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
    marginTop: 2,
  },
  perfil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    borderRadius: radius.tarjeta,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  perfilAvatarAnillo: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  perfilAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfilAvatarTexto: {
    fontSize: 18,
    fontFamily: fuentes.display,
    color: '#FFFFFF',
  },
  perfilAvatarBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 17,
    height: 17,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfilNombre: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
  },
  perfilMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  perfilDetalle: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    flexShrink: 1,
  },
  perfilRol: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  perfilRolTexto: {
    fontSize: 9.5,
    fontFamily: fuentes.semibold,
    letterSpacing: 0.2,
  },
  seccionTitulo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  seccionNota: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  acciones: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  seccion: {
    fontSize: typography.micro,
    fontFamily: fuentes.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
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
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaTitulo: { fontSize: typography.cuerpo, fontFamily: fuentes.bold },
  filaSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 2 },
  filaDispositivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  fab: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
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
  formAyuda: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
  switchFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  seguridadError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  seguridadErrorTexto: {
    flex: 1,
    fontFamily: fuentes.semibold,
    fontSize: typography.cuerpoChico,
    lineHeight: 18,
  },
  accionCodigo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  accionCodigoTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
  },
  accionCodigoSub: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    marginTop: 2,
    lineHeight: 16,
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
  pie: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
  piePunto: { width: 6, height: 6, borderRadius: radius.full },
  version: {
    textAlign: 'center',
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
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
  backupInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  backupInfoTexto: {
    flex: 1,
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
    lineHeight: 20,
  },
  invitacionCodigo: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  invitacionCodigoTexto: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
});
