# 🏪 MiCaja

Punto de venta (POS) para Mipymes cubanas, construido con **React Native (Expo)** y **SQLite local**. Funciona sin conexión y con todos los datos guardados en el propio dispositivo.

## ✨ Características

- **Venta rápida**: catálogo de productos con categorías, emojis y colores; carrito con contador por línea y descuentos (5%, 10%, 15%, 20% o personalizado).
- **Formas de pago cubanas**: Efectivo (con cálculo de cambio y montos rápidos), Transfermóvil, EnZona, Transferencia bancaria y pago Mixto.
- **Turnos de caja**: apertura y cierre de turno por usuario para controlar los ingresos del día.
- **Control de inventario**: stock disponible y stock mínimo por producto, con avisos de agotado y stock insuficiente al vender.
- **Historial de ventas**: consulta y detalle de ventas del día o por fechas.
- **Resumen y estadísticas**: ventas e ingresos del día, producto más vendido y gráficos.
- **Múltiples usuarios**: acceso por PIN con roles (administrador y vendedor).
- **Exportación**: comparte el historial en PDF u otros formatos.
- **Tema claro y oscuro**, interfaz en español con tipografías personalizadas.

## 🛠️ Tecnologías

- [Expo SDK 57](https://expo.dev) · React Native 0.86 · React 19
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) — base de datos local (SQLite)
- [React Navigation](https://reactnavigation.org) — pestañas y stack
- [Zustand](https://zustand-demo.pmnd.rs) — estado global
- [expo-linear-gradient](https://docs.expo.dev/versions/latest/sdk/linear-gradient/) — fondos con gradiente
- [expo-sharing](https://docs.expo.dev/versions/latest/sdk/sharing/) y `expo-document-picker` — exportación de reportes

## 📦 Requisitos

- Node.js 18 o superior
- Expo CLI (`npx expo`)
- Dispositivo físico con la app **Expo Go**, o emulador Android/iOS

## 🚀 Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor de desarrollo
npx expo start

# 3. Escanear el código QR con Expo Go (Android/iOS)
#    o presionar 'a' para emulador Android / 'i' para iOS
```

## 📱 Uso rápido

1. **Inicia sesión** con tu PIN (el usuario administrador se crea al primer arranque).
2. **Abre la caja** desde la pestaña *Inicio* o *Vender*.
3. Toca los productos para agregarlos al carrito, aplica descuento si deseas y presiona **Cobrar**.
4. Elige la **forma de pago** y confirma la venta.
5. Revisa ventas, estadísticas e inventario en las demás pestañas.

## ⚙️ Configuración

En **Ajustes** puedes cambiar el nombre del negocio, la moneda (CUP, USD, EUR…), el símbolo monetario, el tema (claro/oscuro) y gestionar productos, categorías y usuarios.

## 🗂️ Estructura del proyecto

```
src/
├── components/   # Componentes reutilizables (UI, gráficos, avisos)
├── db/           # SQLite: migraciones, seed, repositorios y exportación
├── navigation/   # Navegación (tabs + stack)
├── screens/      # Pantallas (Inicio, Vender, Historial, Resumen, Ajustes, …)
├── store/        # Estado global (Zustand): sesión, carrito, tema, avisos
├── theme/        # Paleta de colores, gradientes, tipografías y medidas
├── types/        # Tipos TypeScript compartidos
└── utils/        # Utilidades (cálculos, fechas, PDF)
```

## 📄 Licencia

Este proyecto es de uso libre. Los datos quedan almacenados únicamente en el dispositivo del usuario.