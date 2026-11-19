import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { InfoDispositivo, RespuestaActivacion } from '../api/cliente';
import { ErrorApi } from '../api/cliente';
import { CLAVE_CODIGO_PENDIENTE, leerSetting } from '../api/config';
import { activarConCodigo, nombreDispositivoPorDefecto } from '../sync/activacion';
import { guardarSetting } from '../db/repos/settings';
import { useTema } from '../store/tema';
import { Boton, Campo, Gradiente, Pantalla, Tarjeta } from '../components/UI';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';

interface DetalleLimite {
  dispositivos?: InfoDispositivo[];
  maxDispositivos?: number;
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo activar el dispositivo.';
}

export default function ActivacionScreen({
  onAtras,
  onActivado,
  codigoInicial = '',
}: {
  onAtras: () => void;
  onActivado: () => void;
  codigoInicial?: string;
}) {
  const db = useSQLiteContext();
  const { colores } = useTema();

  const [codigo, setCodigo] = useState(codigoInicial);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [activado, setActivado] = useState<RespuestaActivacion | null>(null);
  const [reemplazo, setReemplazo] = useState<{
    dispositivos: InfoDispositivo[];
    maxDispositivos: number;
  } | null>(null);

  useEffect(() => {
    nombreDispositivoPorDefecto(db)
      .then((valor) => setNombre(valor))
      .catch(() => undefined);
  }, [db]);

  // Un código generado en el registro puede quedar pendiente de activar
  // (p. ej. si el usuario cerró la app a mitad del flujo).
  useEffect(() => {
    if (codigoInicial) return;
    leerSetting(db, CLAVE_CODIGO_PENDIENTE)
      .then((guardado) => {
        if (guardado) setCodigo(guardado);
      })
      .catch(() => undefined);
  }, [db, codigoInicial]);

  async function activar(reemplazarA?: string) {
    if (guardando) return;

    const limpio = codigo.trim().toUpperCase();
    if (!/^MICAJA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(limpio)) {
      setError('Escribe un código válido con el formato MICAJA-XXXX-XXXX-XXXX.');
      return;
    }
    if (!nombre.trim()) {
      setError('Escribe un nombre para identificar este dispositivo.');
      return;
    }

    setError(null);
    setGuardando(true);
    try {
      const respuesta = await activarConCodigo(db, limpio, nombre, {
        reemplazarA,
      });
      const actual = await leerSetting(db, 'nombre_negocio');
      if (!actual || actual === 'Mi Negocio') {
        await guardarSetting(db, 'nombre_negocio', respuesta.empresa.nombre);
      }
      setReemplazo(null);
      setActivado(respuesta);
    } catch (fallo) {
      if (
        fallo instanceof ErrorApi &&
        fallo.codigo === 'LIMITE_DISPOSITIVOS' &&
        fallo.detalles
      ) {
        const detalles = fallo.detalles as DetalleLimite;
        if (Array.isArray(detalles.dispositivos) && detalles.dispositivos.length > 0) {
          setReemplazo({
            dispositivos: detalles.dispositivos,
            maxDispositivos: detalles.maxDispositivos ?? detalles.dispositivos.length,
          });
          setError(null);
          return;
        }
      }
      setError(mensajeDeError(fallo));
    } finally {
      setGuardando(false);
    }
  }

  function elegirReemplazo(dispositivo: InfoDispositivo) {
    setReemplazo(null);
    void activar(dispositivo.id);
  }

  return (
    <Pantalla>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.contenido}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={onAtras}
            hitSlop={8}
            style={({ pressed }) => [styles.volver, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="arrow-back" size={20} color={colores.textoSuave} />
            <Text style={[styles.volverTexto, { color: colores.textoSuave }]}>Volver</Text>
          </Pressable>

          <View style={styles.hero}>
            <Gradiente colores={gradientes.primario} estilo={styles.logo}>
              <MaterialIcons
                name={activado ? 'check-circle' : 'phonelink-lock'}
                size={34}
                color="#FFFFFF"
              />
            </Gradiente>
            <Text style={[styles.titulo, { color: colores.texto }]}>
              {activado ? 'Dispositivo activado' : 'Activa este dispositivo'}
            </Text>
            <Text style={[styles.subtitulo, { color: colores.textoSuave }]}>
              {activado
                ? 'La licencia quedó guardada y la caja ya puede sincronizarse.'
                : 'Introduce el código que recibiste al crear la cuenta o que te entregó el administrador.'}
            </Text>
          </View>

          {activado ? (
            <Tarjeta estilo={styles.tarjeta}>
              <View style={styles.resumen}>
                <Text style={[styles.resumenEtiqueta, { color: colores.textoSuave }]}>
                  Negocio
                </Text>
                <Text style={[styles.resumenValor, { color: colores.texto }]}>
                  {activado.empresa.nombre}
                </Text>
                <Text style={[styles.resumenEtiqueta, { color: colores.textoSuave }]}>
                  Vence
                </Text>
                <Text style={[styles.resumenValor, { color: colores.texto }]}>
                  {new Date(activado.venceEn).toLocaleDateString()}
                </Text>
              </View>
              <Boton
                titulo="Continuar"
                icono="arrow-forward"
                tamanio="lg"
                onPress={onActivado}
              />
            </Tarjeta>
          ) : (
            <Tarjeta estilo={styles.tarjeta}>
              <Campo
                etiqueta="Código de activación"
                valor={codigo}
                onChange={(texto) => {
                  setCodigo(texto.toUpperCase());
                  if (error) setError(null);
                }}
                placeholder="MICAJA-XXXX-XXXX-XXXX"
                icono="vpn-key"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={23}
                autoFocus
              />
              <Campo
                etiqueta="Nombre de este dispositivo"
                valor={nombre}
                onChange={setNombre}
                placeholder="Ej.: Caja mostrador"
                icono="devices"
              />

              {reemplazo ? (
                <View style={styles.reemplazo}>
                  <View style={[styles.reemplazoNota, { backgroundColor: colores.advertenciaSuave }]}>
                    <MaterialIcons
                      name="swap-horiz"
                      size={18}
                      color={colores.advertencia}
                    />
                    <Text style={[styles.errorTexto, { color: colores.advertencia }]}>
                      El plan alcanza hasta {reemplazo.maxDispositivos} dispositivos y
                      están todos en uso. Elige cuál se retira para entrar este.
                    </Text>
                  </View>
                  {reemplazo.dispositivos.map((dispositivo) => (
                    <Pressable
                      key={dispositivo.id}
                      onPress={() => elegirReemplazo(dispositivo)}
                      style={({ pressed }) => [
                        styles.reemplazoFila,
                        { borderColor: colores.borde },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <MaterialIcons
                        name={dispositivo.esEste ? 'smartphone' : 'devices-other'}
                        size={18}
                        color={colores.textoSuave}
                      />
                      <View style={styles.reemplazoInfo}>
                        <Text style={[styles.reemplazoNombre, { color: colores.texto }]}>
                          {dispositivo.nombre}
                          {dispositivo.esEste ? ' (este)' : ''}
                        </Text>
                        <Text style={[styles.reemplazoMeta, { color: colores.textoSuave }]}>
                          {dispositivo.plataforma}
                          {dispositivo.lastSeenAt
                            ? ` · visto ${new Date(dispositivo.lastSeenAt).toLocaleDateString()}`
                            : ''}
                        </Text>
                      </View>
                      <MaterialIcons
                        name="chevron-right"
                        size={18}
                        color={colores.textoSuave}
                      />
                    </Pressable>
                  ))}
                  <Boton
                    titulo="Cancelar"
                    tamanio="md"
                    variante="secundario"
                    onPress={() => setReemplazo(null)}
                  />
                </View>
              ) : null}

              {error ? (
                <View style={[styles.error, { backgroundColor: colores.peligroSuave }]}>
                  <MaterialIcons name="error-outline" size={18} color={colores.peligro} />
                  <Text style={[styles.errorTexto, { color: colores.peligro }]}>{error}</Text>
                </View>
              ) : null}

              <Boton
                titulo="Activar dispositivo"
                icono="phonelink-lock"
                tamanio="lg"
                cargando={guardando}
                onPress={activar}
              />
            </Tarjeta>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  volver: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: spacing.md,
  },
  volverTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: typography.tituloGrande,
    fontFamily: fuentes.bold,
    marginTop: spacing.lg,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitulo: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  tarjeta: {
    width: '100%',
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorTexto: {
    flex: 1,
    fontFamily: fuentes.semibold,
    fontSize: typography.cuerpoChico,
    lineHeight: 18,
  },
  reemplazo: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  reemplazoNota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  reemplazoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  reemplazoInfo: {
    flex: 1,
  },
  reemplazoNombre: {
    fontFamily: fuentes.semibold,
    fontSize: typography.cuerpoChico,
  },
  reemplazoMeta: {
    fontFamily: fuentes.regular,
    fontSize: typography.micro,
    marginTop: 2,
  },
  resumen: {
    marginBottom: spacing.lg,
    gap: 4,
  },
  resumenEtiqueta: {
    fontSize: typography.micro,
    fontFamily: fuentes.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  resumenValor: {
    fontSize: typography.destacado,
    fontFamily: fuentes.semibold,
  },
});
