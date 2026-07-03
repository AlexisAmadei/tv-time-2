import { StyleSheet, Text, View } from 'react-native';

// Stub — the Add tab (search + fast-add flow, center (+) tab) is built out from
// Story 2.1. Placeholder screen only for the Story 1.1 scaffold.
export default function AddScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
});
