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
import {
  Boton,
  Campo,
  Encabezado,
  Exito,
  Pantalla,
  Superficie,
  Tarjeta,
  TarjetaAviso,
} from '../components/UI';
import { fuentes, radius, spacing, typography } from '../theme';

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
      <Encabezado titulo="Activar licencia" onAtras={onAtras} />
      <Superficie>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.contenido}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!activado ? (
              <View style={styles.intro}>
                <View style={[styles.introIcono, { backgroundColor: colores.exitoSuave }]}>
                  <MaterialIcons name="verified" size={38} color={colores.exito} />
                </View>
                <Text style={[styles.introTitulo, { color: colores.texto }]}>Activar licencia</Text>
                <Text style={[styles.introTexto, { color: colores.textoSuave }]}>
                  Tu licencia te permite usar MiCaja sin restricciones.
                </Text>
              </View>
            ) : null}

            {activado ? (
              <>
                <Exito
                  titulo="¡Licencia activada!"
                  mensaje="Ahora puedes registrar ventas y usar todas las funciones."
                />
                <Tarjeta>
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
              </>
            ) : (
              <Tarjeta>
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

                <View style={[styles.duracion, { backgroundColor: colores.primarioSuave }]}>
                  <MaterialIcons
                    name="check-circle"
                    size={22}
                    color={colores.primario}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.duracionTexto, { color: colores.texto }]}>
                      Duración: 30 días
                    </Text>
                    <Text style={[styles.duracionTexto, { color: colores.texto }]}>
                      Vencimiento:{' '}
                      {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                {reemplazo ? (
                  <View style={styles.reemplazo}>
                    <TarjetaAviso
                      icono="swap-horiz"
                      titulo="Límite de dispositivos"
                      mensaje={`El plan alcanza hasta ${reemplazo.maxDispositivos} dispositivos y están todos en uso. Elige cuál se retira para entrar este.`}
                      tono="advertencia"
                    />
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
                  titulo="Sincronizar"
                  icono="sync"
                  tamanio="lg"
                  cargando={guardando}
                  onPress={activar}
                />
                <Pressable onPress={onAtras} style={styles.masTarde}>
                  <Text style={[styles.masTardeTexto, { color: colores.textoSuave }]}>
                    Más tarde
                  </Text>
                </Pressable>
              </Tarjeta>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Superficie>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  intro: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  introIcono: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  introTitulo: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.display,
  },
  introTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  duracion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  duracionTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    lineHeight: 20,
  },
  masTarde: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  masTardeTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
  },
  contenido: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
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
