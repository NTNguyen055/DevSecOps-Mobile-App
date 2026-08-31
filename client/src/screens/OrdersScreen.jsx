import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getUserOrders } from '../api/apiClient';
import { useAuth } from '../auth/useAuth';

function OrderCard({ order }) {
  const statusColor = {
    pending: '#d97706',
    completed: '#16a34a',
    cancelled: '#dc2626',
  }[order.status] || '#8b7ea8';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.orderId}>Order #{order.id}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {order.status?.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.cardDivider} />

      {order.items?.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name || `Product #${item.product_id}`}</Text>
          <Text style={styles.itemMeta}>
            x{item.quantity}  ·  ${parseFloat(item.price_at_purchase).toFixed(2)}
          </Text>
        </View>
      ))}

      <View style={styles.cardFooter}>
        <Text style={styles.date}>
          {new Date(order.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
          })}
        </Text>
        <Text style={styles.total}>${parseFloat(order.total).toFixed(2)}</Text>
      </View>
    </View>
  );
}

export default function OrdersScreen() {
  const { user, token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user || !token) return;
    try {
      const data = await getUserOrders(user.id, token);
      setOrders(data);
    } catch {
      Alert.alert('Error', 'Could not load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={orders}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#7c3aed" />
      }
      renderItem={({ item }) => <OrderCard order={item} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySubtitle}>Your order history will appear here.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0c1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0c1a' },
  list: { padding: 12, paddingBottom: 30, flexGrow: 1 },
  card: {
    backgroundColor: '#1a1528',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d2545',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  orderId: { color: '#e2d9f3', fontWeight: '700', fontSize: 15 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDivider: { height: 1, backgroundColor: '#2d2545', marginBottom: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { color: '#a78bca', fontSize: 13, flex: 1, marginRight: 8 },
  itemMeta: { color: '#6b6883', fontSize: 13 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d2545',
  },
  date: { color: '#6b6883', fontSize: 12 },
  total: { color: '#c084fc', fontSize: 18, fontWeight: '800' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#e2d9f3', marginBottom: 8 },
  emptySubtitle: { color: '#6b6883', fontSize: 14 },
});
