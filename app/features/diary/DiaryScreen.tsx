import { StyleSheet, Text, View } from 'react-native';

// Stub — the Diary tab (chronological watch history) is built out from Story
// 4.1. Placeholder screen only for the Story 1.1 scaffold.
export default function DiaryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Diary</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
});
