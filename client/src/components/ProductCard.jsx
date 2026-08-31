import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function ProductCard({ product, onPress }) {
  const inStock = product.inventory_quantity > 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {/* Image placeholder */}
      <View style={styles.imageWrap}>
        <Text style={styles.imageEmoji}>🛍️</Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.price}>${parseFloat(product.price).toFixed(2)}</Text>

        <View style={[styles.stockBadge, inStock ? styles.stockIn : styles.stockOut]}>
          <Text style={styles.stockText}>{inStock ? 'In Stock' : 'Out of Stock'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: 4,
    backgroundColor: '#1a1528',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2d2545',
    overflow: 'hidden',
    maxWidth: '50%',
  },
  cardPressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  imageWrap: {
    height: 110,
    backgroundColor: '#0f0c1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageEmoji: { fontSize: 48 },
  info: { padding: 10 },
  name: { color: '#e2d9f3', fontSize: 13, fontWeight: '600', marginBottom: 4, lineHeight: 18 },
  price: { color: '#c084fc', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  stockIn: { backgroundColor: '#14532d22' },
  stockOut: { backgroundColor: '#450a0a22' },
  stockText: { fontSize: 10, fontWeight: '700', color: '#a3a3a3' },
});
