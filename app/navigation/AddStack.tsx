import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AddScreen from '../features/add/AddScreen';
import TitleDetailScreen from '../features/title-detail/TitleDetailScreen';
import type { TitleDetailParams } from './titleDetailParams';

export type AddStackParamList = {
  AddSearch: undefined;
  TitleDetail: TitleDetailParams;
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
