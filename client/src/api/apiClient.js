const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4001';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

export async function getProducts() {
  const data = await request('/products');
  return data.products || [];
}

export async function getProduct(productId) {
  const data = await request(`/products/${productId}`);
  return data.product || data;
}

export async function registerUser(userData) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
}

export async function loginUser(credentials) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function getCurrentUser(token) {
  return request('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getCart(userId, token) {
  const result = await request(`/cart/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log('GET CART RESPONSE:', JSON.stringify(result, null, 2));

  return result;
}

export async function addCartItem(userId, token, productId, quantity = 1) {
  const result = await request(`/cart/${userId}/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productId, quantity }),
  });

  console.log('ADD CART RESPONSE:', JSON.stringify(result, null, 2));

  return result;
}

export async function updateCartItem(userId, token, productId, quantity) {
  return request(`/cart/${userId}/items/${productId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ quantity }),
  });
}

export async function removeCartItem(userId, token, productId) {
  return request(`/cart/${userId}/items/${productId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function clearCart(userId, token) {
  return request(`/cart/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createOrder(userId, token) {
  return request(`/orders/${userId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getUserOrders(userId, token) {
  const data = await request(`/orders/user/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.orders || [];
}

export async function getOrderDetail(orderId, token) {
  return request(`/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
