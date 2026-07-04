// Shared themed placeholder (Story 1.3). The Diary / Feed / Add tabs are
// intentionally minimal this story — their full warm empty states + data belong
// to Epics 4/5 (Diary 4.1, Feed 5.3) and the log flow to 1.4/1.5. Rather than
// repeat the same themed-title + muted-subtitle body in three files, they all
// render this. Keep it obviously a placeholder — no fabricated data.

import { Text } from 'react-native';

import { Screen } from './Screen';
import { useTheme } from '../theme/ThemeProvider';

export function PlaceholderScreen({ title, subtitle }: { title: string; subtitle: string }) {
  const theme = useTheme();
  return (
    <Screen>
      <Text style={[theme.type.title, { color: theme.colors.inkPrimary }]}>{title}</Text>
      <Text
        style={[theme.type.body, { color: theme.colors.inkSecondary, marginTop: theme.spacing.sm }]}
      >
        {subtitle}
      </Text>
    </Screen>
  );
}
