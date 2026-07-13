import type { Session } from '@supabase/supabase-js';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ProfileScreen from '../features/profile/ProfileScreen';
import DiaryScreen from '../features/diary/DiaryScreen';

export type ProfileStackParamList = {
  ProfileMain: undefined;
  Diary: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack({ session }: { session: Session }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain">
        {(props) => <ProfileScreen session={session} navigation={props.navigation} />}
      </Stack.Screen>
      <Stack.Screen name="Diary" component={DiaryScreen} />
    </Stack.Navigator>
  );
}
