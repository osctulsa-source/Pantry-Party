/**
 * MainTabs — the app's primary navigation (Phase 2 of the UI pass).
 *
 * Three persistent tabs: Pantry (home), Cook (the promoted "Find recipes"
 * destination — the daily hero action), and Settings. A Shopping tab slot is
 * reserved for the August shopping-list arc.
 *
 * Architecture (Option B): this navigator is the FIRST screen of the root
 * native-stack (see App.tsx). Detail screens (Add / Edit / Quick add /
 * Expiring soon / Household / Join / Invite) stay on the root stack and push
 * OVER the tab bar — full-screen, with the native header + back button. Tabs
 * stay mounted after first focus, so switching is instant and screen state
 * (scroll position, carousel page) survives tab flips.
 *
 * Each tab screen draws its own header (headerShown: false here). All chrome
 * colors come from theme/tokens (ADR-006), so the bar follows the Crumb
 * light/dark scheme automatically.
 */
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { Carrot, ChefHat, Settings as SettingsGear, ShoppingCart } from 'lucide-react-native';

import { tokens } from '../theme/tokens';
import { PantryScreen } from '../features/pantry/PantryScreen';
import { RecipesScreen } from '../features/recipes/RecipesScreen';
import { ShoppingScreen } from '../features/shopping/ShoppingScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';

export type CookTabParams = {
  /** Rank Cook results by use-it-up urgency (from Pantry / notifications). */
  focus?: 'useItUp';
  /** Soft-boost recipes that use this pantry ingredient name. */
  ingredient?: string;
};

export type TabParamList = {
  PantryTab: undefined;
  CookTab: CookTabParams | undefined;
  ShoppingTab: undefined;
  SettingsTab: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="PantryTab"
      screenListeners={{
        // A quiet selection tick on every tab switch — the same haptic
        // vocabulary as toggles elsewhere (Phase 3 motion pass).
        tabPress: () => {
          Haptics.selectionAsync().catch(() => {});
        },
      }}
      screenOptions={{
        headerShown: false,
        // Soft cross-shift between tabs (built on RN Animated — no reanimated
        // dependency). 'none' felt inert; a full slide felt heavy.
        animation: 'shift',
        tabBarActiveTintColor: tokens.color.accent,
        tabBarInactiveTintColor: tokens.color.inkMuted,
        tabBarStyle: {
          backgroundColor: tokens.color.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: tokens.color.line,
        },
        tabBarLabelStyle: {
          fontFamily: tokens.font.body.medium,
          fontSize: 11,
        },
      }}
    >
      <Tab.Screen
        name="PantryTab"
        component={PantryScreen}
        options={{
          title: 'Pantry',
          tabBarIcon: ({ color, size }) => <Carrot size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="CookTab"
        component={RecipesScreen}
        options={{
          title: 'Cook',
          tabBarIcon: ({ color, size }) => <ChefHat size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="ShoppingTab"
        component={ShoppingScreen}
        options={{
          title: 'Shopping',
          tabBarIcon: ({ color, size }) => <ShoppingCart size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsGear size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
