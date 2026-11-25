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
- [ ] Activar el mismo código en un segundo dispositivo: debe funcionar mientras el código no expire; todos los usuarios del negocio comparten la misma vigencia.
- [ ] **Adopción de instalación previa:** activar un dispositivo con usuarios/productos/turnos creados antes del código y sincronizar. El snapshot inicial (usuarios → categorías → productos → settings) debe subir primero y los turnos/ventas posteriores deben aplicarse sin errores de llave foránea en `sync_operations`.
- [ ] Si el servidor rechazó operaciones, **Ajustes → Sincronización** muestra *"N con error"* y el botón **Reintentar las N con error**: al pulsarlo se reencolan con un `operation_id` nuevo y se sincronizan.
- [ ] Stock tras adoptar: el inventario del servidor debe terminar igual al local (el upsert de producto lleva el stock compensado por operaciones pendientes).
- [ ] Vender sin conexión: la venta queda en la cola y se envía al recuperar Internet.
- [ ] **Auto-sync al recuperar Internet:** con la app abierta, poner la red en offline, vender y volver a online; la operación sale sin pulsar *Sincronizar*. Volver a primer plano o a la pestaña también debe reintentar. Repetir con un usuario dependiente: sus ventas también se sincronizan.
- [ ] **Settings en todos los roles:** cambiar nombre/moneda desde un dispositivo `propietario`, `admin` y `dependiente`; en los tres casos el cambio debe llegar a la nube y verse en el resto de dispositivos tras el `pull`.
- [ ] Editar un producto offline en un dispositivo y en otro: el cambio con mayor versión gana y el stock se reconcilia.
- [ ] **Dispositivo sin activar:** en una instalación nueva, configurar el negocio sin conexión y comprobar que la venta y los turnos quedan bloqueados con el aviso *Dispositivo sin activar* hasta introducir el código.
- [ ] **Sin gestión de dispositivos:** Ajustes → Sincronización ya no muestra lista ni borrado de terminales; la licencia depende solo del negocio.
- [ ] **Sin límite de plazas:** activar tantas instalaciones como se quiera en el mismo negocio con el mismo código vigente; todas reciben el mismo token y vencimiento.
- [ ] **Invitación de trabajador:** desde un dispositivo activo, *Invitar trabajador* genera un código (`MICAJA-…`). En una instalación nueva, activar con ese código pide crear la cuenta del trabajador (nombre, usuario y PIN) en lugar de los datos del negocio; al sincronizar, el catálogo del negocio aparece y el trabajador entra con rol dependiente.
- [ ] Reutilizar una invitación (o esperar su caducidad) debe devolver un error claro, no activar un segundo dispositivo.
- [ ] **Login global:** en una instalación nueva (o tras borrar datos), entrar con `usuario` + PIN de una cuenta existente. Debe validar contra el servidor, registrar/reutilizar el dispositivo, traer empresa/licencia y abrir la app sin pedir código de activación.
- [ ] **Usuario único:** crear otro negocio e intentar usar un `usuario` ya existente: debe rechazarse por el índice global. Tras un login global válido, el mismo usuario debe poder entrar desde otro navegador/dispositivo.
- [ ] **Misma huella:** cerrar sesión o borrar la cuenta local y volver a entrar con el mismo navegador reutiliza la instalación; la huella ya no ata el dispositivo a un negocio.
- [ ] **PIN incorrecto:** el login global debe responder credenciales inválidas; repetir hasta superar el límite debe devolver `DEMASIADOS_INTENTOS`. Un bloqueo local por intentos no debe saltarse con la nube.
- [ ] **Dependiente desde huella nueva:** entra con usuario + PIN como cualquier otro rol; la licencia del negocio cubre a todos sus usuarios.
- [ ] **Hash, no PIN:** crear/editar un usuario y sincronizar; en `usuarios.password_hash` debe quedar `sha256it$…`, el `pull` no debe devolverlo y la red nunca debe llevar el PIN en claro.
- [ ] **Conflicto de negocio:** con ventas/usuarios locales de otro negocio, el login global pide confirmar y limpiar/restaurar los datos antes de entrar; no debe mezclar catálogos.
- [ ] **Activación tras borrar datos:** borrar los datos locales, activar con el código del negocio y entrar con usuario + PIN: el pull descarga catálogo e historial completos.
- [ ] **Misma instalación en otro negocio:** activar con el código de otro negocio ya no se rechaza por la huella; los datos locales se limpian al cambiar de negocio.
- [ ] Marcar una licencia como vencida en el servidor y sincronizar: la app muestra el aviso de licencia vencida e impide vender, abrir caja y cerrar turno.
- [ ] **Acceso con licencia vencida:** cerrar sesión (o borrar los datos locales) y volver a entrar con usuario + PIN debe funcionar; la app abre con el aviso *Licencia vencida* y permite llegar a **Ajustes › Sincronización** para renovar. El login NUNCA debe quedar bloqueado por la licencia.
- [ ] **Suspensión desde el servidor:** suspender la licencia por API y sincronizar: el push/pull devuelve `LICENCIA_SUSPENDIDA`, la app invalida la licencia local y bloquea la caja; al reactivarla y sincronizar, vuelve a operar.
- [ ] **Modo consulta con licencia vencida:** al entrar (o al borrar datos y volver a entrar) la app descarga catálogo e historial con `/api/sync/pull-consulta`; el Historial muestra las ventas reales y el aviso *Datos en modo consulta*. El push sigue rechazándose y no se pueden vender ni abrir/cerrar turnos.
- [ ] **Cambio de negocio:** al entrar en otro negocio desde el mismo teléfono se muestra el aviso *Cambiar de negocio*, los datos locales se borran y se descargan los del negocio nuevo. Si el conflicto es solo un usuario local duplicado, NO se ofrece borrar: se pide cambiar el nombre de usuario.
- [ ] **Renovación desde la app:** con soporte generando un código nuevo (`POST /api/admin/licencias/:id/renovar` con la nueva `venceEn`), introducirlo en **Ajustes › Sincronización → Renovar licencia**: la licencia se activa, desaparece el aviso y la caja vuelve a operar tras sincronizar.
- [ ] **Renovación por administrador:** `PATCH /api/admin/licencias/:id` con `venceEn` y `estado: 'activa'` re-firma el token y la app vuelve a operar al sincronizar.

### Rentabilidad
- [ ] Guardar un costo unitario en un producto y verificar que vuelve a aparecer al editarlo.
- [ ] Vender ese producto y comprobar que el costo queda congelado en la línea de venta: cambiar el costo del producto después no altera reportes pasados.
- [ ] En Reportes, abrir **Ver rentabilidad** solo con rol admin; un dependiente no debe ver la opción ni la pantalla.
- [ ] Probar los períodos Hoy, Semana, Mes y uno personalizado; el reporte y la lista de gastos deben cambiar con el rango.
- [ ] Verificar ganancia neta = ventas netas − costo de lo vendido − gastos, y que el margen use ventas netas.
- [ ] Crear, editar y eliminar un gasto; el total debe actualizarse al instante y el cambio debe llegar a otro dispositivo tras sincronizar.
- [ ] Sin conexión: comprobar que se muestra el último reporte guardado con el aviso "Último reporte guardado" y que los gastos locales siguen disponibles.
- [ ] Con líneas sin costo registrado, confirmar el aviso de ganancia posiblemente sobreestimada.

### Pestaña Gestión y cierre guiado
- [ ] En la barra inferior debe aparecer la pestaña **Gestión**, con las secciones **Rentabilidad** y **Cierre del día**.
- [ ] Vender un producto con costo y abrir Rentabilidad: la venta debe aparecer de inmediato aunque falte conexión.
- [ ] Verificar los períodos Hoy, 7 días, Este mes, Mes anterior y personalizado.
- [ ] Registrar un gasto en efectivo y comprobar que sale de la caja y descuenta la ganancia una sola vez.
- [ ] Abrir caja con efectivo inicial, registrar entrada, retiro y gasto en efectivo; el efectivo esperado debe calcularse con la fórmula completa.
- [ ] Contar efectivo, comprobar sobrante/faltante y guardar una observación.
- [ ] Revisar el resumen de ventas por forma de pago y las anulaciones/devoluciones.
- [ ] Ver el inventario teórico, contar un producto opcionalmente y aplicar la diferencia como ajuste auditado.
- [ ] Confirmar el cierre dos veces: la segunda no debe alterar el historial.
- [ ] Sin conexión: comprobar aviso de operaciones pendientes y que el cierre se sube al sincronizar.

### Ajustes finales de pestañas y caja
- [ ] El menú inferior debe mostrar pestañas separadas **Rentabilidad** y **Cierre**, sin pestaña **Gestión**.
- [ ] El historial de cierres NO debe aparecer en la pantalla de Cierre; se abre solo desde **Rentabilidad → Historial de cierres** con rol admin.
- [ ] Al abrir caja, el efectivo inicial es obligatorio; debe aparecer el modal **Día listo para comenzar a vender** con botón **Nueva venta**.
- [ ] En el cierre solo deben aparecer: efectivo inicial, ventas cobradas en efectivo, devoluciones en efectivo y efectivo esperado. Gastos, entradas y retiros NO aparecen allí.
- [ ] Gastos y movimientos de caja (entradas/retiros) se gestionan solo desde **Rentabilidad** y no alteran el efectivo esperado del cierre.
- [ ] En inventario, una venta de 1 unidad debe mostrar `−1` una sola vez, sin duplicarlo como salida adicional.
