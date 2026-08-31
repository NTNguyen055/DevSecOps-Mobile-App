import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { clearCart, createOrder, getCart } from '../api/apiClient';
import { useAuth } from '../auth/useAuth';
import CartItem from '../components/CartItem';

export default function CartScreen() {
  const { user, token } = useAuth();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ordering, setOrdering] = useState(false);

  const load = useCallback(async () => {
    if (!user || !token) return;
    try {
      const data = await getCart(user.id, token);
      setCart(data);
    } catch {
      Alert.alert('Error', 'Could not load cart.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handlePlaceOrder() {
    if (!cart?.items?.length) return;
    Alert.alert(
      'Confirm Order',
      `Place order for $${total.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Place Order',
          style: 'default',
          onPress: async () => {
            setOrdering(true);
            try {
              await createOrder(user.id, token);
              Alert.alert('Order Placed! 🎉', 'Your order has been placed successfully.');
              load();
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not place order.');
            } finally {
              setOrdering(false);
            }
          },
        },
      ]
    );
  }

  async function handleClearCart() {
    Alert.alert('Clear Cart', 'Remove all items?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearCart(user.id, token);
            load();
          } catch {
            Alert.alert('Error', 'Could not clear cart.');
          }
        },
      },
    ]);
  }

  const items = cart?.items || [];
  const total = items.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.product_id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#7c3aed" />
        }
        renderItem={({ item }) => (
          <CartItem item={item} userId={user.id} token={token} onRefresh={load} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🛒</Text>
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptySubtitle}>Browse products and add some items!</Text>
          </View>
        }
      />

      {items.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{items.length} items</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
          <View style={styles.btnRow}>
            <Pressable style={styles.clearBtn} onPress={handleClearCart}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
            <Pressable
              style={[styles.orderBtn, ordering && styles.btnDisabled]}
              onPress={handlePlaceOrder}
              disabled={ordering}
            >
              {ordering ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.orderBtnText}>Place Order</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0c1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0c1a' },
  list: { padding: 12, paddingBottom: 20, flexGrow: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#e2d9f3', marginBottom: 8 },
  emptySubtitle: { color: '#6b6883', fontSize: 14 },
  footer: {
    backgroundColor: '#1a1528',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2d2545',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: { color: '#8b7ea8', fontSize: 14 },
  totalValue: { color: '#c084fc', fontSize: 22, fontWeight: '800' },
  btnRow: { flexDirection: 'row', gap: 10 },
  clearBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3d3558',
    alignItems: 'center',
  },
  clearBtnText: { color: '#8b7ea8', fontWeight: '600' },
  orderBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  orderBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
