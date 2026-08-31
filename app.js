require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db');
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/products.routes');
const userRoutes = require('./routes/users.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/orders.routes');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./docs/openapi.yaml');

const app = express();

// Mobile app (React Native/Expo) does not have a fixed browser origin.
// Allow all origins in development; set CLIENT_ORIGIN=* or specific IPs in production.
const clientOrigin = process.env.CLIENT_ORIGIN || '*';

app.use(cors({
  origin: clientOrigin === '*' ? true : clientOrigin,
  credentials: clientOrigin !== '*'
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API root info (available in all environments since there's no web frontend)
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'NK Forge: Storefront — REST API',
    version: '1.0.0',
    docs: '/api-docs',
    health: '/health/db'
  });
});

app.get('/health/db', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');

    res.status(200).json({
      status: 'ok',
      databaseTime: result.rows[0].now
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});

app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/users', userRoutes);
app.use('/cart', cartRoutes);
app.use('/orders', orderRoutes);

// 404 handler for unknown API routes
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

module.exports = app;