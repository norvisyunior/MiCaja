# Checklist de pruebas de MiCaja

Marca cada punto en un teléfono Android real antes de entregar o vender la app.

## 1. Primer arranque

- [ ] Instalar la app desde cero (sin datos previos).
- [ ] La app muestra la pantalla **Bienvenido a MiCaja**, no el login con usuarios de prueba.
- [ ] Intentar continuar con campos vacíos: debe mostrar un error claro.
- [ ] Escribir un PIN de 3 dígitos: debe rechazarlo.
- [ ] Escribir dos PIN distintos: debe rechazarlo.
- [ ] Completar negocio, administrador y PIN: entra directo a la app.
- [ ] Cerrar y volver a abrir: aparece el login con el administrador creado.

## 2. Acceso y seguridad

- [ ] Abrir la app, elegir el administrador y entrar con el PIN correcto.
- [ ] Escribir un PIN incorrecto: muestra cuántos intentos quedan.
- [ ] Fallar 5 veces seguidas: bloquea el usuario durante 5 minutos.
- [ ] Cerrar la app y volver a abrir: el bloqueo se mantiene.
- [ ] Cambiar el PIN desde **Ajustes → Usuarios**: el PIN anterior deja de funcionar y el nuevo sí funciona.
- [ ] Editar un usuario dejando el PIN vacío: conserva el PIN actual.
- [ ] Desactivar un usuario: no aparece en la pantalla de login.
- [ ] Intentar eliminar el último administrador: la app lo impide.

## 3. Venta y caja

- [ ] Abrir caja desde **Vender**.
- [ ] Vender un producto en efectivo con monto exacto.
- [ ] Vender en efectivo con monto mayor: calcula el cambio correctamente.
- [ ] Vender con Transfermóvil, EnZona y Transferencia.
- [ ] Vender con pago mixto: el efectivo y el digital suman el total.
- [ ] Intentar vender más unidades que el stock: la app lo impide.
- [ ] Verificar que el stock baja después de vender.
- [ ] Cerrar caja contando solo el efectivo: la diferencia se calcula contra el efectivo esperado, no contra el total con pagos digitales.
- [ ] Intentar cerrar la misma caja dos veces: no debe duplicar el cierre.

## 4. Anulaciones e historial

- [ ] Anular una venta de un turno abierto: se devuelve el stock y la venta queda marcada como anulada.
- [ ] Cerrar el turno e intentar anular una venta de ese turno: la app lo impide.
- [ ] Verificar que las ventas anuladas no suman en estadísticas, resumen del día, PDF ni cierre de caja.
- [ ] Revisar el historial por hoy, semana, mes y todas.

## 5. Productos, categorías e imágenes

- [ ] Crear, editar y eliminar un producto.
- [ ] Crear una categoría y asignarla a un producto.
- [ ] Agregar una foto grande desde la galería.
- [ ] Verificar que la imagen se ve correctamente después de guardar y reabrir la app.
- [ ] Revisar que el backup no crece de forma exagerada con varias fotos.

## 6. Backup y restauración

- [ ] Exportar un backup y guardarlo fuera del teléfono.
- [ ] Restaurar ese backup: la sesión se cierra y los datos vuelven a aparecer.
- [ ] Intentar restaurar un archivo que no es de MiCaja: debe rechazarlo sin borrar datos.
- [ ] Intentar restaurar un JSON incompleto: debe rechazarlo sin borrar datos.
- [ ] Restaurar un backup antiguo con PIN en texto plano: el usuario puede entrar y su PIN se migra solo.

## 7. Reportes y ajustes

- [ ] Exportar PDF del día, la semana, el mes y un día concreto.
- [ ] Verificar que el PDF muestra el nombre **MiCaja** y los totales correctos.
- [ ] Cambiar nombre del negocio, moneda y símbolo.
- [ ] Cambiar entre tema claro y oscuro.
- [ ] Verificar que el tema elegido se conserva al reiniciar.

## 8. Estabilidad

- [ ] Rotar el teléfono en las pantallas principales.
- [ ] Abrir el teclado en formularios y confirmar que no tapa los campos.
- [ ] Usar la app con modo oscuro del sistema.
- [ ] Revisar que no hay pantallas en blanco ni cierres inesperados.

## 9. Pruebas automáticas

Estas se ejecutan en la computadora, no en el teléfono:

```bash
# Desde la raíz del monorepo: app móvil + backend + contratos
npm test

# Verificación de tipos de las tres piezas
npm run typecheck
```

> El flujo E2E del backend se ejecuta dentro de `apps/backend && npm test` y requiere `DATABASE_URL` y `LICENSE_PRIVATE_KEY`; si faltan, esas pruebas se omiten.

## 10. Plataforma: activación, sincronización y licencia

Con el backend corriendo en desarrollo (`cd apps/backend && npm run dev`) y Supabase configurado:

- [ ] Desde **Ajustes → Sincronización**, guardar la URL del servidor y activar el dispositivo con un código de activación.
- [ ] Activar el mismo código en un segundo dispositivo: debe rechazarlo si agotó su límite de usos.
- [ ] **Adopción de instalación previa:** activar un dispositivo con usuarios/productos/turnos creados antes del código y sincronizar. El snapshot inicial (usuarios → categorías → productos → settings) debe subir primero y los turnos/ventas posteriores deben aplicarse sin errores de llave foránea en `sync_operations`.
- [ ] Si el servidor rechazó operaciones, **Ajustes → Sincronización** muestra *"N con error"* y el botón **Reintentar las N con error**: al pulsarlo se reencolan con un `operation_id` nuevo y se sincronizan.
- [ ] Stock tras adoptar: el inventario del servidor debe terminar igual al local (el upsert de producto lleva el stock compensado por operaciones pendientes).
- [ ] Vender sin conexión: la venta queda en la cola y se envía al recuperar Internet.
- [ ] **Auto-sync al recuperar Internet:** con la app abierta, poner la red en offline, vender y volver a online; la operación sale sin pulsar *Sincronizar*. Volver a primer plano o a la pestaña también debe reintentar. Repetir con un usuario dependiente: sus ventas también se sincronizan.
- [ ] **Settings en todos los roles:** cambiar nombre/moneda desde un dispositivo `propietario`, `admin` y `dependiente`; en los tres casos el cambio debe llegar a la nube y verse en el resto de dispositivos tras el `pull`.
- [ ] Editar un producto offline en un dispositivo y en otro: el cambio con mayor versión gana y el stock se reconcilia.
- [ ] **Dispositivo sin activar:** en una instalación nueva, configurar el negocio sin conexión y comprobar que la venta y los turnos quedan bloqueados con el aviso *Dispositivo sin activar* hasta introducir el código.
- [ ] **Gestión de dispositivos** (Ajustes → Sincronización, solo admin): la lista muestra los dispositivos del negocio, marca el actual y permite desvincular. El propio dispositivo se retira sin código; retirar otro exige el código de activación vigente.
- [ ] **Límite del plan:** con el plan básico (3 dispositivos) activar un cuarto dispositivo: debe ofrecer retirar un dispositivo existente en lugar de fallar; tras elegirlo, el anterior queda inactivo y el nuevo opera.
- [ ] **Invitación de trabajador:** desde un dispositivo activo, *Invitar trabajador* genera un código (`MICAJA-…`). En una instalación nueva, activar con ese código pide crear la cuenta del trabajador (nombre, usuario y PIN) en lugar de los datos del negocio; al sincronizar, el catálogo del negocio aparece y el trabajador entra con rol dependiente.
- [ ] Reutilizar una invitación (o esperar su caducidad) debe devolver un error claro, no activar un segundo dispositivo.
- [ ] **Login global:** en una instalación nueva (o tras borrar datos), entrar con `usuario` + PIN de una cuenta existente. Debe validar contra el servidor, registrar/reutilizar el dispositivo, traer empresa/licencia y abrir la app sin pedir código de activación.
- [ ] **Usuario único:** crear otro negocio e intentar usar un `usuario` ya existente: debe rechazarse por el índice global. Tras un login global válido, el mismo usuario debe poder entrar desde otro navegador/dispositivo (respetando plazas y rol).
- [ ] **Misma huella:** cerrar sesión o borrar la cuenta local y volver a entrar con el mismo navegador no debe crear un dispositivo duplicado ni pedir reemplazo; la huella guardada debe reutilizarse.
- [ ] **PIN incorrecto:** el login global debe responder credenciales inválidas; repetir hasta superar el límite debe devolver `DEMASIADOS_INTENTOS`. Un bloqueo local por intentos no debe saltarse con la nube.
- [ ] **Dependiente sin plaza:** un usuario `dependiente` desde una huella nueva debe recibir *activación requerida*; `propietario`/`admin` pueden ocupar una plaza libre y solo el propietario puede reemplazar un dispositivo cuando el plan está lleno.
- [ ] **Hash, no PIN:** crear/editar un usuario y sincronizar; en `usuarios.password_hash` debe quedar `sha256it$…`, el `pull` no debe devolverlo y la red nunca debe llevar el PIN en claro.
- [ ] **Conflicto de negocio:** con ventas/usuarios locales de otro negocio, el login global debe rechazarse y pedir borrar datos o restaurar respaldo; no debe mezclar catálogos.
- [ ] **Auto-desvinculación:** en *Dispositivos*, elegir el dispositivo actual y desvincularlo: la app conserva los datos, deja de sincronizar y vuelve a pedir un código de activación (la caja queda bloqueada como *sin activar*). Reactivarlo con un código del mismo negocio restaura la operación sin duplicar datos.
- [ ] **Un negocio por teléfono:** intentar activar un dispositivo que ya pertenece a otro negocio debe rechazarse con un mensaje que pida borrar los datos o restaurar un respaldo.
- [ ] Marcar una licencia como vencida en el servidor y sincronizar: la app muestra el aviso de licencia vencida e impide vender, abrir caja y cerrar turno.
- [ ] **Suspensión desde el servidor:** suspender la licencia por API y sincronizar: el push/pull devuelve `LICENCIA_SUSPENDIDA`, la app invalida la licencia local y bloquea la caja; al reactivarla y sincronizar, vuelve a operar.
- [ ] Con licencia vencida: el historial, los reportes y los datos siguen accesibles.
- [ ] Renovar la licencia y sincronizar: desaparece el aviso y la caja vuelve a operar.
