import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
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
import { Gradiente } from '../components/UI';
import { useTema } from '../store/tema';
import { fuentes, gradientes, radius, typography } from '../theme';

export type ParamListRaiz = {
  Principal: undefined;
  Productos: undefined;
  Historial: undefined;
  HistorialCierres: undefined;
  Resumen: undefined;
  Rentabilidad: undefined;
};

export type ParamListTabs = {
  Inicio: undefined;
  Historial: undefined;
  Vender: undefined;
  Cierre: undefined;
  Configuracion: undefined;
};

type NombreIcono = ComponentProps<typeof MaterialIcons>['name'];

const ICONOS: Record<keyof ParamListTabs, { activo: NombreIcono; inactivo: NombreIcono }> = {
  Inicio: { activo: 'home', inactivo: 'home' },
  Historial: { activo: 'history', inactivo: 'history' },
  Vender: { activo: 'shopping-cart', inactivo: 'shopping-cart' },
  Cierre: { activo: 'lock-outline', inactivo: 'lock-outline' },
  Configuracion: { activo: 'grid-view', inactivo: 'grid-view' },
};

const ETIQUETAS: Record<keyof ParamListTabs, string> = {
  Inicio: 'Inicio',
  Historial: 'Historial',
  Vender: 'Ventas',
  Cierre: 'Cierre',
  Configuracion: 'Más',
};

const Tab = createBottomTabNavigator<ParamListTabs>();
const Stack = createNativeStackNavigator<ParamListRaiz>();

function HistorialTab() {
  return <HistorialScreen esPestania />;
}

function VentasTabButton({ onPress, accessibilityState }: BottomTabBarButtonProps) {
  const { colores } = useTema();
  const activo = accessibilityState?.selected === true;

  return (
    <View style={styles.ventasSlot}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Ventas"
        accessibilityState={accessibilityState}
        style={({ pressed }) => [
          styles.ventasBoton,
          {
            borderColor: colores.superficie,
            shadowColor: colores.primario,
            transform: [{ scale: pressed ? 0.94 : activo ? 1.04 : 1 }],
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Gradiente colores={gradientes.cta} estilo={styles.ventasGradiente}>
          <MaterialIcons name="shopping-cart" size={27} color="#FFFFFF" />
        </Gradiente>
      </Pressable>
      <Text
        style={[
          styles.ventasEtiqueta,
          { color: activo ? colores.primario : colores.textoSuave },
        ]}
      >
        Ventas
      </Text>
    </View>
  );
}

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
      <Tab.Screen name="Historial" component={HistorialTab} options={{ title: ETIQUETAS.Historial }} />
      <Tab.Screen
        name="Vender"
        component={PosScreen}
        options={{
          title: ETIQUETAS.Vender,
          tabBarLabel: '',
          tabBarButton: (props) => <VentasTabButton {...props} />,
        }}
      />
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
      <Stack.Screen name="Resumen" component={ResumenScreen} />
      <Stack.Screen name="Rentabilidad" component={RentabilidadScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  ventasSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  ventasBoton: {
    position: 'absolute',
    top: -26,
    width: 62,
    height: 62,
    borderRadius: radius.full,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 9,
    elevation: 8,
  },
  ventasGradiente: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ventasEtiqueta: {
    fontSize: 10,
    fontFamily: fuentes.semibold,
    letterSpacing: 0.1,
    lineHeight: 13,
    marginBottom: 4,
  },
});
