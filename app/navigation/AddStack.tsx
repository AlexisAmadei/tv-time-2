// Add-tab stack navigator (Story 2.2).
//
// Until now the app was tab-only (AppShell wraps a bottom-tab navigator, no
// stack anywhere). Tapping a search result to open its detail needs a pushed
// route, so the Add tab gains its own native-stack: AddScreen is the initial
// route, TitleDetail is pushed on top. Other tabs stay stack-free until a later
// story needs detail navigation from them (e.g. 2.4's Home watchlist shelf).
//
// The stack header is hidden — the detail screen owns its own back affordance /
// layout, consistent with the app's header-less tab screens.

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AddScreen from '../features/add/AddScreen';
import TitleDetailScreen from '../features/title-detail/TitleDetailScreen';

export type AddStackParamList = {
  AddSearch: undefined;
  TitleDetail: { tmdbId: number; mediaType: 'movie' | 'tv' };
};

const Stack = createNativeStackNavigator<AddStackParamList>();

export default function AddStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AddSearch" component={AddScreen} />
      <Stack.Screen name="TitleDetail" component={TitleDetailScreen} />
    </Stack.Navigator>
  );
}
