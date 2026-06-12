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
import { Carrot, ChefHat, Settings as SettingsGear } from 'lucide-react-native';

import { tokens } from '../theme/tokens';
import { PantryScreen } from '../features/pantry/PantryScreen';
import { RecipesScreen } from '../features/recipes/RecipesScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';

export type TabParamList = {
  PantryTab: undefined;
  CookTab: undefined;
  SettingsTab: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="PantryTab"
      screenOptions={{
        headerShown: false,
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
