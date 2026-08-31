import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { removeCartItem, updateCartItem } from '../api/apiClient';

export default function CartItem({ item, userId, token, onRefresh }) {
  const [loading, setLoading] = useState(false);

  async function changeQty(delta) {
    const newQty = item.quantity + delta;
    if (newQty < 1) {
      handleRemove();
      return;
    }
    setLoading(true);
    try {
      await updateCartItem(userId, token, item.product_id, newQty);
      onRefresh();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update quantity.');
    } finally {
      setLoading(false);
    }
  }

  function handleRemove() {
    Alert.alert('Remove Item', `Remove ${item.name} from cart?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await removeCartItem(userId, token, item.product_id);
            onRefresh();
          } catch {
            Alert.alert('Error', 'Could not remove item.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  const subtotal = parseFloat(item.price) * item.quantity;

  return (
    <View style={styles.card}>
      <View style={styles.emojiWrap}>
        <Text style={styles.emoji}>🛍️</Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.unitPrice}>${parseFloat(item.price).toFixed(2)} each</Text>

        <View style={styles.controls}>
          <Pressable style={styles.qtyBtn} onPress={() => changeQty(-1)} disabled={loading}>
            <Ionicons name="remove" size={14} color="#e2d9f3" />
          </Pressable>
          <Text style={styles.qty}>{item.quantity}</Text>
          <Pressable style={styles.qtyBtn} onPress={() => changeQty(1)} disabled={loading}>
            <Ionicons name="add" size={14} color="#e2d9f3" />
          </Pressable>
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.subtotal}>${subtotal.toFixed(2)}</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#7c3aed" style={{ marginTop: 8 }} />
        ) : (
          <Pressable style={styles.removeBtn} onPress={handleRemove}>
            <Ionicons name="trash-outline" size={16} color="#dc2626" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1a1528',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2545',
    alignItems: 'center',
    gap: 10,
  },
  emojiWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#0f0c1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: { fontSize: 28 },
  info: { flex: 1 },
  name: { color: '#e2d9f3', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  unitPrice: { color: '#8b7ea8', fontSize: 12, marginBottom: 8 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#2d2545',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qty: { color: '#e2d9f3', fontWeight: '700', fontSize: 15, minWidth: 20, textAlign: 'center' },
  right: { alignItems: 'flex-end', gap: 8 },
  subtotal: { color: '#c084fc', fontSize: 16, fontWeight: '800' },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#450a0a33',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
