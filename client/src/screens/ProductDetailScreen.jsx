import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { addCartItem, getProduct } from '../api/apiClient';
import { useAuth } from '../auth/useAuth';

export default function ProductDetailScreen({ route }) {
  const { productId } = route.params;
  const { user, token } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const load = useCallback(async () => {
    try {
      const data = await getProduct(productId);
      setProduct(data);
    } catch {
      Alert.alert('Error', 'Could not load product.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  async function handleAddToCart() {
    if (!user || !token) {
      Alert.alert('Sign In Required', 'Please sign in to add items to your cart.');
      return;
    }
    setAddingToCart(true);
    try {
      await addCartItem(user.id, token, productId, quantity);
      Alert.alert('Added!', `${product.name} added to cart.`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not add to cart.');
    } finally {
      setAddingToCart(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Product not found.</Text>
      </View>
    );
  }

  const inStock = product.inventory_quantity > 0;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Product image placeholder */}
      <View style={styles.imagePlaceholder}>
        <Text style={styles.imageEmoji}>🛍️</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.stockRow}>
          <View style={[styles.badge, inStock ? styles.badgeIn : styles.badgeOut]}>
            <Text style={styles.badgeText}>{inStock ? 'In Stock' : 'Out of Stock'}</Text>
          </View>
          {inStock && (
            <Text style={styles.stockCount}>{product.inventory_quantity} remaining</Text>
          )}
        </View>

        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>${parseFloat(product.price).toFixed(2)}</Text>
        <Text style={styles.description}>{product.description || 'No description available.'}</Text>

        {/* Quantity selector */}
        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>Quantity</Text>
          <View style={styles.qtyControl}>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </Pressable>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => setQuantity((q) => Math.min(product.inventory_quantity, q + 1))}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.cartBtn, (!inStock || addingToCart) && styles.cartBtnDisabled]}
          onPress={handleAddToCart}
          disabled={!inStock || addingToCart}
        >
          {addingToCart ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.cartBtnText}>
              {inStock ? 'Add to Cart' : 'Out of Stock'}
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0c1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0c1a' },
  errorText: { color: '#e2d9f3', fontSize: 16 },
  imagePlaceholder: {
    height: 240,
    backgroundColor: '#1a1528',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2d2545',
  },
  imageEmoji: { fontSize: 80 },
  body: { padding: 20 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeIn: { backgroundColor: '#14532d' },
  badgeOut: { backgroundColor: '#450a0a' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  stockCount: { color: '#6b6883', fontSize: 13 },
  name: { fontSize: 24, fontWeight: '800', color: '#e2d9f3', marginBottom: 8 },
  price: { fontSize: 28, fontWeight: '800', color: '#c084fc', marginBottom: 16 },
  description: { fontSize: 15, color: '#8b7ea8', lineHeight: 22, marginBottom: 24 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  qtyLabel: { color: '#a78bca', fontSize: 15, fontWeight: '600' },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#2d2545',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: { color: '#e2d9f3', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  qtyValue: { color: '#e2d9f3', fontSize: 18, fontWeight: '700', minWidth: 30, textAlign: 'center' },
  cartBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  cartBtnDisabled: { opacity: 0.5 },
  cartBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
});
