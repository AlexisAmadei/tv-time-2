import { StyleSheet, Text, View } from 'react-native';

// Stub — the Profile tab (stats, settings, theme) is built out from Story 4.2.
// Placeholder screen only for the Story 1.1 scaffold.
export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
});
