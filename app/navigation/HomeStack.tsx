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
