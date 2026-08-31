import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/useAuth';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: logout,
      },
    ]);
  }

  return (
    <View style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.username || user?.email || '?')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.username}>{user?.username || 'User'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* Info cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Info</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color="#7c3aed" />
            <Text style={styles.infoLabel}>Username</Text>
            <Text style={styles.infoValue}>{user?.username || '—'}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color="#7c3aed" />
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{user?.email || '—'}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#7c3aed" />
            <Text style={styles.infoLabel}>User ID</Text>
            <Text style={styles.infoValue}>#{user?.id}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="code-slash-outline" size={18} color="#7c3aed" />
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0 (React Native)</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.infoRow}>
            <Ionicons name="server-outline" size={18} color="#7c3aed" />
            <Text style={styles.infoLabel}>Backend</Text>
            <Text style={styles.infoValue}>Express 5 + PostgreSQL</Text>
          </View>
        </View>
      </View>

      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#fff" />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0c1a', padding: 20 },
  avatarSection: { alignItems: 'center', paddingVertical: 32 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  username: { color: '#e2d9f3', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  email: { color: '#8b7ea8', fontSize: 14 },
  section: { marginBottom: 20 },
  sectionTitle: { color: '#6b6883', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  infoCard: {
    backgroundColor: '#1a1528',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2d2545',
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  infoLabel: { color: '#a78bca', fontSize: 14, flex: 1 },
  infoValue: { color: '#e2d9f3', fontSize: 14, fontWeight: '500', maxWidth: '50%', textAlign: 'right' },
  separator: { height: 1, backgroundColor: '#2d2545', marginHorizontal: 14 },
  logoutBtn: {
    flexDirection: 'row',
    backgroundColor: '#7f1d1d',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  logoutText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
