import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Category, Product, CartItem, Order, OrderItem, InventoryItem, Coupon } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'instamart.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      balance REAL DEFAULT 0,
      total_spent REAL DEFAULT 0,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      emoji TEXT DEFAULT '\u{1F3EA}'
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      stock INTEGER DEFAULT -1,
      category_id INTEGER REFERENCES categories(id),
      is_active INTEGER DEFAULT 1,
      how_to_use TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      product_id INTEGER REFERENCES products(id),
      quantity INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      product_id INTEGER REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT REFERENCES orders(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      delivery_status TEXT DEFAULT 'pending',
      delivery_message TEXT
    );
    CREATE TABLE IF NOT EXISTS product_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      code TEXT NOT NULL,
      is_sold INTEGER DEFAULT 0,
      sold_at TEXT,
      order_id TEXT,
      buyer_id TEXT
    );
    CREATE TABLE IF NOT EXISTS user_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      UNIQUE(user_id, permission)
    );
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      discount_percent INTEGER NOT NULL,
      min_purchase REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 0,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS giveaway_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ─── Users ───

export function ensureUser(id: string) {
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    db.prepare('INSERT INTO users (id, referral_code) VALUES (?, ?)').run(id, code);
  }
}

export function getUserBalance(id: string): number {
  const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(id) as { balance: number } | undefined;
  return row?.balance ?? 0;
}

export function getUserTotalSpent(id: string): number {
  const row = db.prepare('SELECT total_spent FROM users WHERE id = ?').get(id) as { total_spent: number } | undefined;
  return row?.total_spent ?? 0;
}

export function updateBalance(id: string, amount: number) {
  ensureUser(id);
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, id);
}

export function updateTotalSpent(id: string, amount: number) {
  db.prepare('UPDATE users SET total_spent = total_spent + ? WHERE id = ?').run(amount, id);
}

export function getReferralCode(id: string): string | null {
  const row = db.prepare('SELECT referral_code FROM users WHERE id = ?').get(id) as { referral_code: string } | undefined;
  return row?.referral_code ?? null;
}

export function getUserIdByReferralCode(code: string): string | null {
  const row = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(code) as { id: string } | undefined;
  return row?.id ?? null;
}

export function setReferredBy(id: string, referredBy: string) {
  db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(referredBy, id);
}

export function getReferralCount(id: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE referred_by = ?').get(id) as { count: number };
  return row.count;
}

// ─── Categories ───

export function getCategories(): Category[] {
  return db.prepare('SELECT * FROM categories ORDER BY id').all() as Category[];
}

export function getCategory(id: number): Category | undefined {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category | undefined;
}

// ─── Products ───

export function getProductsByCategory(catId: number): Product[] {
  return db.prepare('SELECT * FROM products WHERE category_id = ? AND is_active = 1 ORDER BY slot_id').all(catId) as Product[];
}

export function getAllProducts(): Product[] {
  return db.prepare('SELECT * FROM products ORDER BY slot_id').all() as Product[];
}

export function getProductBySlot(slotId: string): Product | undefined {
  return db.prepare('SELECT * FROM products WHERE slot_id = ?').get(slotId) as Product | undefined;
}

export function getProductById(id: number): Product | undefined {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | undefined;
}

export function addProduct(slotId: string, name: string, description: string, price: number, categoryId: number, stock: number) {
  db.prepare('INSERT INTO products (slot_id, name, description, price, category_id, stock) VALUES (?, ?, ?, ?, ?, ?)').run(slotId, name, description, price, categoryId, stock);
}

export function editProduct(slotId: string, fields: Partial<{ name: string; price: number; stock: number; description: string; how_to_use: string; is_active: boolean }>) {
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(slotId);
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE slot_id = ?`).run(...vals);
}

export function removeProduct(slotId: string) {
  db.prepare('DELETE FROM products WHERE slot_id = ?').run(slotId);
}

export function setProductStock(id: number, stock: number) {
  db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, id);
}

// ─── Cart ───

export function getCart(userId: string): CartItem[] {
  return db.prepare(`
    SELECT c.id, c.user_id, c.product_id, c.quantity, p.slot_id, p.name as product_name, p.price as product_price
    FROM cart c JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ?
  `).all(userId) as CartItem[];
}

export function addToCart(userId: string, productId: number, quantity: number) {
  const existing = db.prepare('SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ?').get(userId, productId) as { id: number; quantity: number } | undefined;
  if (existing) {
    db.prepare('UPDATE cart SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
  } else {
    db.prepare('INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)').run(userId, productId, quantity);
  }
}

export function removeFromCart(cartId: number) {
  db.prepare('DELETE FROM cart WHERE id = ?').run(cartId);
}

export function clearCart(userId: string) {
  db.prepare('DELETE FROM cart WHERE user_id = ?').run(userId);
}

export function getCartTotal(userId: string): number {
  const row = db.prepare('SELECT COALESCE(SUM(p.price * c.quantity), 0) as total FROM cart c JOIN products p ON c.product_id = p.id WHERE c.user_id = ?').get(userId) as { total: number };
  return row.total;
}

// ─── Wishlist ───

export function getWishlist(userId: string): Product[] {
  return db.prepare('SELECT p.* FROM wishlist w JOIN products p ON w.product_id = p.id WHERE w.user_id = ?').all(userId) as Product[];
}

export function addToWishlist(userId: string, productId: number) {
  const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?').get(userId, productId);
  if (!existing) {
    db.prepare('INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)').run(userId, productId);
  }
}

export function removeFromWishlist(userId: string, productId: number) {
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(userId, productId);
}

// ─── Orders ───

export function createOrder(id: string, userId: string, total: number) {
  db.prepare('INSERT INTO orders (id, user_id, total_amount) VALUES (?, ?, ?)').run(id, userId, total);
}

export function addOrderItem(orderId: string, productId: number, productName: string, quantity: number, unitPrice: number) {
  db.prepare('INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)').run(orderId, productId, productName, quantity, unitPrice);
}

export function getUserOrders(userId: string): Order[] {
  return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Order[];
}

export function getOrder(id: string): Order | undefined {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;
}

export function getOrderItems(orderId: string): OrderItem[] {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as OrderItem[];
}

export function getAllOrders(status?: string): Order[] {
  if (status) {
    return db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all(status) as Order[];
  }
  return db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as Order[];
}

export function updateOrderStatus(id: string, status: string) {
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
}

export function updateDeliveryMessage(itemId: number, message: string) {
  db.prepare("UPDATE order_items SET delivery_status = 'delivered', delivery_message = ? WHERE id = ?").run(message, itemId);
}

export function getPendingDeliveries(): OrderItem[] {
  return db.prepare("SELECT * FROM order_items WHERE delivery_status = 'pending'").all() as OrderItem[];
}

// ─── Inventory ───

export function addInventoryCode(productId: number, code: string) {
  db.prepare('INSERT INTO product_inventory (product_id, code) VALUES (?, ?)').run(productId, code);
}

export function addInventoryCodesBulk(productId: number, codes: string[]): number {
  const insert = db.prepare('INSERT INTO product_inventory (product_id, code) VALUES (?, ?)');
  const txn = db.transaction((codes: string[]) => {
    let count = 0;
    for (const code of codes) {
      insert.run(productId, code);
      count++;
    }
    return count;
  });
  return txn(codes);
}

export function getAvailableCode(productId: number): InventoryItem | undefined {
  return db.prepare('SELECT * FROM product_inventory WHERE product_id = ? AND is_sold = 0 ORDER BY id LIMIT 1').get(productId) as InventoryItem | undefined;
}

export function markCodeSold(id: number, orderId: string, buyerId: string) {
  db.prepare("UPDATE product_inventory SET is_sold = 1, sold_at = datetime('now'), order_id = ?, buyer_id = ? WHERE id = ?").run(orderId, buyerId, id);
}

export function listInventoryCodes(productId: number): InventoryItem[] {
  return db.prepare('SELECT * FROM product_inventory WHERE product_id = ? ORDER BY id').all(productId) as InventoryItem[];
}

export function getInventoryCount(productId: number): { available: number; sold: number } {
  const total = db.prepare('SELECT COUNT(*) as count FROM product_inventory WHERE product_id = ?').get(productId) as { count: number };
  const sold = db.prepare('SELECT COUNT(*) as count FROM product_inventory WHERE product_id = ? AND is_sold = 1').get(productId) as { count: number };
  return { available: total.count - sold.count, sold: sold.count };
}

// ─── Permissions ───

export function setUserPermission(userId: string, permission: string, grant: boolean) {
  if (grant) {
    db.prepare('INSERT OR IGNORE INTO user_permissions (user_id, permission) VALUES (?, ?)').run(userId, permission);
  } else {
    db.prepare('DELETE FROM user_permissions WHERE user_id = ? AND permission = ?').run(userId, permission);
  }
}

export function hasPermission(userId: string, permission: string): boolean {
  const row = db.prepare('SELECT id FROM user_permissions WHERE user_id = ? AND permission = ?').get(userId, permission);
  return !!row;
}

// ─── Coupons ───

export function createCoupon(code: string, discount: number, minPurchase: number, maxUses: number) {
  db.prepare('INSERT INTO coupons (code, discount_percent, min_purchase, max_uses) VALUES (?, ?, ?, ?)').run(code, discount, minPurchase, maxUses);
}

export function getCoupon(code: string): Coupon | undefined {
  return db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(code) as Coupon | undefined;
}

export function useCoupon(id: number) {
  db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(id);
}

// ─── Giveaway ───

export function addGiveawayParticipant(userId: string, channelId: string) {
  db.prepare('INSERT OR IGNORE INTO giveaway_participants (user_id, channel_id) VALUES (?, ?)').run(userId, channelId);
}

export function getGiveawayParticipants(channelId: string): string[] {
  const rows = db.prepare('SELECT user_id FROM giveaway_participants WHERE channel_id = ?').all(channelId) as { user_id: string }[];
  return rows.map(r => r.user_id);
}

// ─── Settings ───

export function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ─── Shop Channel ───

export function setShopChannel(channelId: string) {
  setSetting('shop_channel', channelId);
}

export function getShopChannel(): string | undefined {
  return getSetting('shop_channel');
}

// ─── Analytics ───

export function getTotalRevenue(): number {
  const row = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'completed'").get() as { total: number };
  return row.total;
}

export function getOrderCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
  return row.count;
}

export function getTopProducts(limit = 5): { name: string; total: number; count: number }[] {
  return db.prepare(`
    SELECT p.name, SUM(oi.unit_price * oi.quantity) as total, SUM(oi.quantity) as count
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    GROUP BY oi.product_id ORDER BY total DESC LIMIT ?
  `).all(limit) as { name: string; total: number; count: number }[];
}
