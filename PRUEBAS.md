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
