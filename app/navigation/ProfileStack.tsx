// Profile-tab stack navigator (Story 4.1).
//
// Mirrors HomeStack.tsx/AddStack.tsx/RecommendationsStack.tsx: the Profile tab
// needs to push the new Diary screen from a tap on ProfileScreen's "Diary"
// row, so it gets its own stack instead of being a bare tab (as it was until
// this story). Unlike those three siblings, ProfileScreen needs the `session`
// prop (it owns sign-out) — this component takes it and threads it through to
// the initial route via an inline render function, the same way AppShell.tsx
// used to render ProfileScreen directly before this story.
//
// No TitleDetail route here (unlike HomeStack/AddStack/RecommendationsStack)
// — Diary's scope wall explicitly declines a push-to-detail affordance; a
// Diary row's tap target opens EditWatchSheet in place, not a navigation.

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
