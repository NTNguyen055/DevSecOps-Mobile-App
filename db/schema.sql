CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  inventory_quantity INTEGER NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_at_purchase NUMERIC(10, 2) NOT NULL CHECK (price_at_purchase >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Products if table is empty
INSERT INTO products (name, description, price, inventory_quantity)
SELECT 'NK-Forge Hardcover Notebook', 'Premium grid-lined engineering journal with archival paper and ribbon bookmark.', 24.99, 50
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'NK-Forge Hardcover Notebook');

INSERT INTO products (name, description, price, inventory_quantity)
SELECT 'NK-Forge Signature Matte Pen', 'Precision weighted matte black rollerball pen with smooth archival ink.', 18.50, 75
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'NK-Forge Signature Matte Pen');

INSERT INTO products (name, description, price, inventory_quantity)
SELECT 'DevSecOps Hardware Security Key', 'FIDO2 and U2F certified hardware authentication security key for multi-factor authentication.', 45.00, 30
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'DevSecOps Hardware Security Key');

INSERT INTO products (name, description, price, inventory_quantity)
SELECT 'Cloud Infrastructure Desk Mat', 'Extra-large waterproof desk pad with cloud & microservices architectural reference.', 29.99, 40
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Cloud Infrastructure Desk Mat');

INSERT INTO products (name, description, price, inventory_quantity)
SELECT 'NK-Forge Insulated Thermal Tumbler', 'Double-wall vacuum insulated stainless steel coffee tumbler (500ml).', 22.00, 60
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'NK-Forge Insulated Thermal Tumbler');