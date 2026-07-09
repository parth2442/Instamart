import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from '../database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple admin password (change in production)
const ADMIN_PASSWORD = process.env.WEB_PANEL_PASSWORD || 'instamart2026';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth middleware ───
function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization;
  if (token !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Login ───
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ token: ADMIN_PASSWORD });
  }
  res.status(401).json({ error: 'Invalid password' });
});

// ─── Get all products ───
app.get('/api/products', auth, (req, res) => {
  const products = db.getAllProducts();
  const categories = db.getCategories();
  const catMap = new Map(categories.map(c => [c.id, c]));

  const data = products.map(p => {
    const cnt = db.getInventoryCount(p.id);
    const cat = catMap.get(p.category_id);
    return {
      id: p.id,
      slot_id: p.slot_id,
      name: p.name,
      price: p.price,
      stock: p.stock,
      category: cat?.name || 'Unknown',
      category_emoji: cat?.emoji || '',
      is_active: p.is_active,
      available_codes: cnt.available,
      sold_codes: cnt.sold,
    };
  });

  res.json(data);
});

// ─── Bulk add codes ───
app.post('/api/products/:id/stock', auth, (req, res) => {
  const productId = parseInt(req.params.id as string);
  const { codes } = req.body;

  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: 'No codes provided' });
  }

  const product = db.getProductById(productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const added = db.addInventoryCodesBulk(productId, codes);
  const cnt = db.getInventoryCount(productId);

  res.json({
    added,
    available: cnt.available,
    sold: cnt.sold,
    product: product.name,
  });
});

// ─── Get inventory codes for a product ───
app.get('/api/products/:id/inventory', auth, (req, res) => {
  const productId = parseInt(req.params.id as string);
  const product = db.getProductById(productId);
  if (!product) return res.status(404).json({ error: 'Not found' });

  const codes = db.listInventoryCodes(productId);
  res.json({
    product: product.name,
    slot_id: product.slot_id,
    codes: codes.map(c => ({
      id: c.id,
      code: c.code,
      is_sold: c.is_sold,
      sold_at: c.sold_at,
      buyer_id: c.buyer_id,
    })),
  });
});

export function startWebServer(port = 3000) {
  app.listen(port, () => {
    console.log(`Web panel: http://localhost:${port}`);
  });
}
