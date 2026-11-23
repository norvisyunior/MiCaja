import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import HomeScreen from '../screens/HomeScreen';
import PosScreen from '../screens/PosScreen';
import HistorialScreen from '../screens/HistorialScreen';
import ResumenScreen from '../screens/ResumenScreen';
import ConfigScreen from '../screens/ConfigScreen';
import ProductosScreen from '../screens/ProductosScreen';
import RentabilidadScreen from '../screens/RentabilidadScreen';
import CierreScreen from '../screens/CierreScreen';
import HistorialCierresScreen from '../screens/HistorialCierresScreen';
import { useTema } from '../store/tema';
import { fuentes } from '../theme';

export type ParamListRaiz = {
  Principal: undefined;
  Productos: undefined;
  Historial: undefined;
  HistorialCierres: undefined;
};

export type ParamListTabs = {
  Inicio: undefined;
  Vender: undefined;
  Resumen: undefined;
  Rentabilidad: undefined;
  Cierre: undefined;
  Configuracion: undefined;
};

type NombreIcono = ComponentProps<typeof MaterialIcons>['name'];

const ICONOS: Record<keyof ParamListTabs, { activo: NombreIcono; inactivo: NombreIcono }> = {
  Inicio: { activo: 'home', inactivo: 'home' },
  Vender: { activo: 'shopping-cart', inactivo: 'shopping-cart' },
  Resumen: { activo: 'bar-chart', inactivo: 'bar-chart' },
  Rentabilidad: { activo: 'trending-up', inactivo: 'trending-up' },
  Cierre: { activo: 'receipt-long', inactivo: 'receipt-long' },
  Configuracion: { activo: 'grid-view', inactivo: 'grid-view' },
};

const ETIQUETAS: Record<keyof ParamListTabs, string> = {
  Inicio: 'Inicio',
  Vender: 'Ventas',
  Resumen: 'Reportes',
  Rentabilidad: 'Rentabilidad',
  Cierre: 'Cierre',
  Configuracion: 'Más',
};

const Tab = createBottomTabNavigator<ParamListTabs>();
const Stack = createNativeStackNavigator<ParamListRaiz>();

function Tabs() {
  const { colores } = useTema();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.texto,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: fuentes.semibold,
          letterSpacing: 0.1,
          lineHeight: 13,
          marginTop: 2,
        },
        tabBarIconStyle: { marginTop: 2 },
        tabBarStyle: {
          height: 62 + insets.bottom,
          paddingTop: 7,
          paddingBottom: insets.bottom + 5,
          backgroundColor: colores.superficie,
          borderTopWidth: 1,
          borderTopColor: colores.borde,
          elevation: 0,
          shadowOpacity: 0,
        },
        sceneStyle: { backgroundColor: colores.fondo },
        tabBarIcon: ({ color, focused }) => (
          <MaterialIcons
            name={ICONOS[route.name][focused ? 'activo' : 'inactivo']}
            size={23}
            color={focused ? colores.primario : color}
          />
        ),
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} options={{ title: ETIQUETAS.Inicio }} />
      <Tab.Screen name="Vender" component={PosScreen} options={{ title: ETIQUETAS.Vender }} />
      <Tab.Screen name="Resumen" component={ResumenScreen} options={{ title: ETIQUETAS.Resumen }} />
      <Tab.Screen name="Rentabilidad" component={RentabilidadScreen} options={{ title: ETIQUETAS.Rentabilidad }} />
      <Tab.Screen name="Cierre" component={CierreScreen} options={{ title: ETIQUETAS.Cierre }} />
      <Tab.Screen name="Configuracion" component={ConfigScreen} options={{ title: ETIQUETAS.Configuracion }} />
    </Tab.Navigator>
  );
}

export function NavegadorRaiz() {
  const { colores } = useTema();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colores.primarioOscuro },
      }}
    >
      <Stack.Screen name="Principal" component={Tabs} />
      <Stack.Screen name="Productos" component={ProductosScreen} />
      <Stack.Screen name="Historial" component={HistorialScreen} />
      <Stack.Screen name="HistorialCierres" component={HistorialCierresScreen} />
    </Stack.Navigator>
  );
}
