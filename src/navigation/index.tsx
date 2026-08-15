import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import PosScreen from '../screens/PosScreen';
import HistorialScreen from '../screens/HistorialScreen';
import ResumenScreen from '../screens/ResumenScreen';
import ConfigScreen from '../screens/ConfigScreen';
import ProductosScreen from '../screens/ProductosScreen';
import TurnoScreen from '../screens/TurnoScreen';
import { useTema } from '../store/tema';
import { fuentes, gradientes, radius } from '../theme';
import { Gradiente } from '../components/UI';

export type ParamListRaiz = {
  Principal: undefined;
  Productos: undefined;
  Turno: undefined;
};

export type ParamListTabs = {
  Inicio: undefined;
  Historial: undefined;
  Vender: undefined;
  Resumen: undefined;
  Configuracion: undefined;
};

type NombreIcono = ComponentProps<typeof MaterialIcons>['name'];

const ICONOS: Record<keyof ParamListTabs, { activo: NombreIcono; inactivo: NombreIcono }> = {
  Inicio: { activo: 'home', inactivo: 'home' },
  Vender: { activo: 'point-of-sale', inactivo: 'point-of-sale' },
  Historial: { activo: 'receipt-long', inactivo: 'receipt-long' },
  Resumen: { activo: 'bar-chart', inactivo: 'bar-chart' },
  Configuracion: { activo: 'tune', inactivo: 'tune' },
};

const ETIQUETAS: Record<keyof ParamListTabs, string> = {
  Inicio: 'Inicio',
  Vender: 'Vender',
  Historial: 'Historial',
  Resumen: 'Resumen',
  Configuracion: 'Ajustes',
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
        tabBarActiveTintColor: colores.acento,
        tabBarInactiveTintColor: colores.textoSuave,
        tabBarLabelStyle: { fontSize: 11, fontFamily: fuentes.medium, letterSpacing: 0.2 },
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          backgroundColor: colores.barra,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colores.bordeLuminoso,
          shadowColor: colores.sombra,
          shadowOpacity: 0.4,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
          elevation: 12,
        },
        sceneStyle: { backgroundColor: colores.fondo },
        tabBarIcon: ({ color, focused }) =>
          route.name === 'Vender' ? (
            <View style={styles.venderContenedor}>
              <Gradiente
                colores={gradientes.primario}
                inicio={{ x: 0, y: 0 }}
                fin={{ x: 1, y: 1 }}
                estilo={styles.venderPlaca}
              >
                <MaterialIcons name="point-of-sale" size={24} color="#FFFFFF" />
              </Gradiente>
            </View>
          ) : (
            <MaterialIcons
              name={ICONOS[route.name][focused ? 'activo' : 'inactivo']}
              size={22}
              color={focused ? colores.acento : color}
            />
          ),
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} options={{ title: ETIQUETAS.Inicio }} />
      <Tab.Screen name="Historial" component={HistorialScreen} options={{ title: ETIQUETAS.Historial }} />
      <Tab.Screen
        name="Vender"
        component={PosScreen}
        options={{ title: ETIQUETAS.Vender, tabBarLabel: () => null }}
      />
      <Tab.Screen name="Resumen" component={ResumenScreen} options={{ title: ETIQUETAS.Resumen }} />
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
        contentStyle: { backgroundColor: colores.fondo },
      }}
    >
      <Stack.Screen name="Principal" component={Tabs} />
      <Stack.Screen name="Productos" component={ProductosScreen} />
      <Stack.Screen name="Turno" component={TurnoScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  venderContenedor: {
    width: 60,
    height: 44,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  venderPlaca: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
