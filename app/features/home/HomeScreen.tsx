import { StyleSheet, Text, View } from 'react-native';

// Stub — the Home tab (Up Next, Watchlist shelf, Recommendations) is built out
// from Story 1.3 onward. Placeholder screen only for the Story 1.1 scaffold.
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
});
