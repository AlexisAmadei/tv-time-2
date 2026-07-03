import { StyleSheet, Text, View } from 'react-native';

// Stub — the Feed tab (chronological activity feed) is built out from Story 5.3.
// Placeholder screen only for the Story 1.1 scaffold.
export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Feed</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
});
