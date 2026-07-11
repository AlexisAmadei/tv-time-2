// Recommendations-tab stack navigator — mirrors HomeStack.tsx: the tab needs
// to push title detail from a tapped card, so it gets its own tiny stack
// instead of being a bare tab.

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import RecommendationsScreen from '../features/recommendations/RecommendationsScreen';
import TitleDetailScreen from '../features/title-detail/TitleDetailScreen';
import type { TitleDetailParams } from './titleDetailParams';

export type RecommendationsStackParamList = {
  RecommendationsMain: undefined;
  TitleDetail: TitleDetailParams;
};

const Stack = createNativeStackNavigator<RecommendationsStackParamList>();

export default function RecommendationsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RecommendationsMain" component={RecommendationsScreen} />
      <Stack.Screen name="TitleDetail" component={TitleDetailScreen} />
    </Stack.Navigator>
  );
}
