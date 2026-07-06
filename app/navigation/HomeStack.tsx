// Home-tab stack navigator (Story 2.4).
//
// Mirrors AddStack.tsx: Home was tab-only (no stack) until the Watchlist shelf
// needed to push title detail from a tapped shelf card — the exact story
// AddStack.tsx's own comment predicted ("2.4's Home watchlist shelf"). HomeMain
// is the initial route, TitleDetail is pushed on top, header hidden (the detail
// screen owns its own back affordance, same as AddStack).

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../features/home/HomeScreen';
import TitleDetailScreen from '../features/title-detail/TitleDetailScreen';
import type { TitleDetailParams } from './titleDetailParams';

export type HomeStackParamList = {
  HomeMain: undefined;
  TitleDetail: TitleDetailParams;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="TitleDetail" component={TitleDetailScreen} />
    </Stack.Navigator>
  );
}
