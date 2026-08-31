import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { registerUser } from '../api/apiClient';
import { useAuth } from '../auth/useAuth';

export default function RegisterScreen({ navigation }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (val) => setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleRegister() {
    if (!form.username || !form.email || !form.password || !form.confirm) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (form.password !== form.confirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await registerUser({ username: form.username, email: form.email, password: form.password });
      await login({ email: form.email, password: form.password });
    } catch (err) {
      Alert.alert('Registration Failed', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join NK Forge: Storefront</Text>

          {[
            { key: 'username', label: 'Username', placeholder: 'johndoe', autoCapitalize: 'none' },
            { key: 'email', label: 'Email', placeholder: 'you@example.com', keyboardType: 'email-address', autoCapitalize: 'none' },
            { key: 'password', label: 'Password', placeholder: '••••••••', secure: true },
            { key: 'confirm', label: 'Confirm Password', placeholder: '••••••••', secure: true },
          ].map(({ key, label, placeholder, keyboardType, autoCapitalize, secure }) => (
            <View key={key} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor="#5a5475"
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize || 'sentences'}
                autoCorrect={false}
                secureTextEntry={secure}
                value={form[key]}
                onChangeText={update(key)}
              />
            </View>
          ))}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Create Account</Text>
            )}
          </Pressable>

          <Pressable onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>
              Already have an account? <Text style={styles.linkAccent}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0c1a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingVertical: 40 },
  card: {
    backgroundColor: '#1a1528',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#2d2545',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#e2d9f3', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#8b7ea8', marginBottom: 28 },
  field: { marginBottom: 16 },
  label: { color: '#a78bca', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: '#0f0c1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2545',
    padding: 14,
    color: '#e2d9f3',
    fontSize: 15,
  },
  btn: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { textAlign: 'center', color: '#8b7ea8', fontSize: 14 },
  linkAccent: { color: '#c084fc', fontWeight: '600' },
});
