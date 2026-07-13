// NavigationContainer is mounted INSIDE the authed branch (App.tsx), so the
// auth screens stay outside the tab tree.

import { useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { DarkTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useTheme } from '../theme/ThemeProvider';
import BottomTabBar from './BottomTabBar';
import AddStack from './AddStack';
import HomeStack from './HomeStack';
import RecommendationsStack from './RecommendationsStack';
import FeedScreen from '../features/feed/FeedScreen';
import ProfileStack from './ProfileStack';

export type RootTabParamList = {
  Home: undefined;
  Recommendations: undefined;
  Add: undefined;
  Feed: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function AppShell({ session }: { session: Session }) {
  const theme = useTheme();

  // Map our tokens onto react-navigation's container theme so scene backgrounds
  // and transitions use the themed surface (no white flash between tabs).
  // Memoized on `theme` so NavigationContainer isn't handed a fresh object every
  // render (the StatusBar is owned once at the app root — see App.tsx).
  const navTheme: NavTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        primary: theme.colors.primary,
        background: theme.colors.surfaceBase,
        card: theme.colors.surfaceRaised,
        text: theme.colors.inkPrimary,
        border: theme.colors.borderHairline,
        notification: theme.colors.primary,
      },
    }),
    [theme],
  );

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        tabBar={(props) => <BottomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home" component={HomeStack} options={{ title: 'Home' }} />
        <Tab.Screen
          name="Recommendations"
          component={RecommendationsStack}
          options={{ title: 'Recommendations' }}
        />
        {/* The (+) fast-add slot. Wraps a stack (2.2) so a tapped result can push
            the title-detail screen; AddScreen stays the initial route. */}
        <Tab.Screen name="Add" component={AddStack} options={{ title: 'Add' }} />
        <Tab.Screen name="Feed" component={FeedScreen} options={{ title: 'Feed' }} />
        {/* Labeled "You" in the UI; route stays `Profile`. Holds temporary
            sign-out plus, since Story 4.1, the Diary entry point — wrapped in
            its own stack (mirrors Add/Home/Recommendations) so Profile can
            push Diary. */}
        <Tab.Screen name="Profile" options={{ title: 'You' }}>
          {() => <ProfileStack session={session} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
