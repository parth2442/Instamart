import dns from 'dns';
import mongoose, { Schema, Model, Document } from 'mongoose';
import type { Category, Product, CartItem, Order, OrderItem, InventoryItem, Coupon } from './types.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/instamart';

let connected = false;

export async function initDB() {
  if (connected) return;
  // Override DNS to Google DNS temporarily for Atlas SRV resolution on restricted ISPs
  const defaultServers = dns.getServers();
  dns.setServers(['8.8.8.8', '8.8.4.4']);
  try {
    await mongoose.connect(MONGO_URI);
  } finally {
    dns.setServers(defaultServers);
  }
  connected = true;
  console.log('MongoDB connected');
}

// ─── Counter (Auto-increment IDs) ───

interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: String,
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model<ICounter>('Counter', counterSchema);

async function nextId(name: string, count = 1): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: count } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  );
  const base = doc ? doc.seq : count;
  return base - count + 1;
}

// ─── User ───

const userSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  total_spent: { type: Number, default: 0 },
  referral_code: { type: String, unique: true, sparse: true },
  referred_by: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

export async function ensureUser(id: string) {
  const existing = await User.findOne({ userId: id });
  if (!existing) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      try {
        await User.create({ userId: id, referral_code: code });
        return;
      } catch (err: any) {
        if (err?.code === 11000 && attempt < 4) continue;
        throw err;
      }
    }
  }
}

export async function getUserBalance(id: string): Promise<number> {
  const user = await User.findOne({ userId: id });
  return user?.balance ?? 0;
}

export async function getUserTotalSpent(id: string): Promise<number> {
  const user = await User.findOne({ userId: id });
  return user?.total_spent ?? 0;
}

export async function updateBalance(id: string, amount: number) {
  await ensureUser(id);
  await User.updateOne({ userId: id }, { $inc: { balance: amount } });
}

export async function deductBalance(id: string, amount: number): Promise<boolean> {
  await ensureUser(id);
  const res = await User.updateOne(
    { userId: id, balance: { $gte: amount } },
    { $inc: { balance: -amount } }
  );
  return res.modifiedCount > 0;
}

export async function exists(collection: string, id: string): Promise<boolean> {
  if (collection === 'order') {
    const doc = await OrderModel.findOne({ orderId: id }).lean();
    return !!doc;
  }
  return false;
}

export async function updateTotalSpent(id: string, amount: number) {
  await User.updateOne({ userId: id }, { $inc: { total_spent: amount } });
}

export async function getReferralCode(id: string): Promise<string | null> {
  const user = await User.findOne({ userId: id });
  return user?.referral_code ?? null;
}

export async function getUserIdByReferralCode(code: string): Promise<string | null> {
  const user = await User.findOne({ referral_code: code });
  return user?.userId ?? null;
}

export async function setReferredBy(id: string, referredBy: string) {
  await User.updateOne({ userId: id }, { referred_by: referredBy });
}

export async function getReferredBy(id: string): Promise<string | null> {
  const user = await User.findOne({ userId: id });
  return user?.referred_by ?? null;
}

export async function getReferralCount(id: string): Promise<number> {
  return User.countDocuments({ referred_by: id });
}

// ─── Category ───

interface ICategory {
  id: number;
  name: string;
  description: string;
  emoji: string;
}

const categorySchema = new Schema<ICategory>({
  id: { type: Number, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  emoji: { type: String, default: '\u{1F3EA}' },
});

const CategoryModel = mongoose.model<ICategory>('Category', categorySchema);

export async function getCategories(): Promise<Category[]> {
  const docs = await CategoryModel.find().sort({ id: 1 }).lean();
  return docs as unknown as Category[];
}

export async function getCategory(id: number): Promise<Category | undefined> {
  const doc = await CategoryModel.findOne({ id }).lean();
  return (doc as unknown as Category) ?? undefined;
}

export async function createCategory(name: string, description: string, emoji: string) {
  const max = await CategoryModel.findOne().sort({ id: -1 }).lean();
  const id = (max && 'id' in max ? (max as any).id : 0) + 1;
  await CategoryModel.create({ id, name, description, emoji });
  return id;
}

export async function updateCategory(id: number, fields: { name?: string; description?: string; emoji?: string }) {
  const update: any = {};
  if (fields.name !== undefined) update.name = fields.name;
  if (fields.description !== undefined) update.description = fields.description;
  if (fields.emoji !== undefined) update.emoji = fields.emoji;
  await CategoryModel.updateOne({ id }, update);
}

// ─── Product ───

interface IProduct {
  id: number;
  slot_id: string;
  name: string;
  description: string;
  price: number;
  price_usd?: number;
  stock: number;
  category_id: number;
  is_active: boolean;
  how_to_use: string;
}

const productSchema = new Schema<IProduct>({
  id: { type: Number, unique: true },
  slot_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },
  price_usd: { type: Number },
  stock: { type: Number, default: -1 },
  category_id: { type: Number, required: true },
  is_active: { type: Boolean, default: true },
  how_to_use: { type: String, default: '' },
});

const ProductModel = mongoose.model<IProduct>('Product', productSchema);

export async function getProductsByCategory(catId: number): Promise<Product[]> {
  const docs = await ProductModel.find({ category_id: catId, is_active: true }).sort({ slot_id: 1 }).lean();
  return docs as unknown as Product[];
}

export async function getAllProducts(): Promise<Product[]> {
  const docs = await ProductModel.find().sort({ slot_id: 1 }).lean();
  return docs as unknown as Product[];
}

export async function getProductBySlot(slotId: string): Promise<Product | undefined> {
  const doc = await ProductModel.findOne({ slot_id: slotId }).lean();
  return (doc as unknown as Product) ?? undefined;
}

export async function getProductById(id: number): Promise<Product | undefined> {
  const doc = await ProductModel.findOne({ id }).lean();
  return (doc as unknown as Product) ?? undefined;
}

export async function addProduct(slotId: string, name: string, description: string, price: number, categoryId: number, stock: number, priceUsd?: number) {
  const id = await nextId('product_id');
  const doc: any = { id, slot_id: slotId, name, description, price, category_id: categoryId, stock };
  if (priceUsd !== undefined) doc.price_usd = priceUsd;
  await ProductModel.create(doc);
}

export async function editProduct(slotId: string, fields: Partial<{ name: string; price: number; price_usd: number; stock: number; description: string; how_to_use: string; is_active: boolean; slot_id: string; category_id: number }>) {
  await ProductModel.updateOne({ slot_id: slotId }, { $set: fields });
}

export async function removeProduct(slotId: string) {
  await ProductModel.deleteOne({ slot_id: slotId });
}

export async function setProductStock(id: number, stock: number) {
  await ProductModel.updateOne({ id }, { $set: { stock } });
}

// ─── Cart ───

interface ICartItem {
  id: number;
  user_id: string;
  product_id: number;
  quantity: number;
}

const cartSchema = new Schema<ICartItem>({
  id: { type: Number, unique: true },
  user_id: { type: String, required: true },
  product_id: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
});

const CartModel = mongoose.model<ICartItem>('Cart', cartSchema);

export async function getCart(userId: string): Promise<CartItem[]> {
  const items = await CartModel.aggregate([
    { $match: { user_id: userId } },
    {
      $lookup: {
        from: 'products',
        localField: 'product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $project: {
        id: 1,
        user_id: 1,
        product_id: 1,
        quantity: 1,
        slot_id: '$product.slot_id',
        product_name: '$product.name',
        product_price: '$product.price',
      },
    },
  ]);
  return items as unknown as CartItem[];
}

export async function addToCart(userId: string, productId: number, quantity: number) {
  const existing = await CartModel.findOne({ user_id: userId, product_id: productId });
  if (existing) {
    await CartModel.updateOne({ _id: existing._id }, { $inc: { quantity } });
  } else {
    const id = await nextId('cart_id');
    await CartModel.create({ id, user_id: userId, product_id: productId, quantity });
  }
}

export async function removeFromCart(cartId: number) {
  await CartModel.deleteOne({ id: cartId });
}

export async function clearCart(userId: string) {
  await CartModel.deleteMany({ user_id: userId });
}

export async function getCartTotal(userId: string): Promise<number> {
  const result = await CartModel.aggregate([
    { $match: { user_id: userId } },
    {
      $lookup: {
        from: 'products',
        localField: 'product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    { $group: { _id: null, total: { $sum: { $multiply: ['$product.price', '$quantity'] } } } },
  ]);
  return result.length > 0 ? result[0].total : 0;
}

// ─── Wishlist ───

interface IWishlist {
  id: number;
  user_id: string;
  product_id: number;
}

const wishlistSchema = new Schema<IWishlist>({
  id: { type: Number, unique: true },
  user_id: { type: String, required: true },
  product_id: { type: Number, required: true },
});

const WishlistModel = mongoose.model<IWishlist>('Wishlist', wishlistSchema);

export async function getWishlist(userId: string): Promise<Product[]> {
  const items = await WishlistModel.aggregate([
    { $match: { user_id: userId } },
    {
      $lookup: {
        from: 'products',
        localField: 'product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    { $replaceRoot: { newRoot: '$product' } },
  ]);
  return items as unknown as Product[];
}

export async function addToWishlist(userId: string, productId: number) {
  const existing = await WishlistModel.findOne({ user_id: userId, product_id: productId });
  if (!existing) {
    const id = await nextId('wishlist_id');
    await WishlistModel.create({ id, user_id: userId, product_id: productId });
  }
}

export async function removeFromWishlist(userId: string, productId: number) {
  await WishlistModel.deleteOne({ user_id: userId, product_id: productId });
}

// ─── Order ───

interface IOrder {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  created_at: Date;
}

const orderSchema = new Schema<IOrder>({
  id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true },
  total_amount: { type: Number, required: true },
  status: { type: String, default: 'pending' },
  created_at: { type: Date, default: Date.now },
});

const OrderModel = mongoose.model<IOrder>('Order', orderSchema);

export async function createOrder(id: string, userId: string, total: number) {
  await OrderModel.create({ id, user_id: userId, total_amount: total });
}

export async function addOrderItem(orderId: string, productId: number, productName: string, quantity: number, unitPrice: number) {
  const id = await nextId('order_item_id');
  await OrderItemModel.create({ id, order_id: orderId, product_id: productId, product_name: productName, quantity, unit_price: unitPrice });
}

export async function getUserOrders(userId: string): Promise<Order[]> {
  const docs = await OrderModel.find({ user_id: userId }).sort({ created_at: -1 }).lean();
  return docs as unknown as Order[];
}

export async function getUserOrderCount(userId: string): Promise<number> {
  return OrderModel.countDocuments({ user_id: userId });
}

export async function getUserCompletedOrderCount(userId: string): Promise<number> {
  return OrderModel.countDocuments({ user_id: userId, status: 'completed' });
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const doc = await OrderModel.findOne({ id }).lean();
  return (doc as unknown as Order) ?? undefined;
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const docs = await OrderItemModel.find({ order_id: orderId }).lean();
  return docs as unknown as OrderItem[];
}

export async function getAllOrders(status?: string): Promise<Order[]> {
  const filter = status ? { status } : {};
  const docs = await OrderModel.find(filter).sort({ created_at: -1 }).lean();
  return docs as unknown as Order[];
}

export async function updateOrderStatus(id: string, status: string) {
  await OrderModel.updateOne({ id }, { $set: { status } });
}

export async function updateDeliveryMessage(itemId: number, message: string) {
  await OrderItemModel.updateOne({ id: itemId }, { $set: { delivery_status: 'delivered', delivery_message: message } });
}

export async function getPendingDeliveries(): Promise<OrderItem[]> {
  const docs = await OrderItemModel.find({ delivery_status: 'pending' }).lean();
  return docs as unknown as OrderItem[];
}

// ─── Order Item ───

interface IOrderItem {
  id: number;
  order_id: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  delivery_status: string;
  delivery_message: string | null;
}

const orderItemSchema = new Schema<IOrderItem>({
  id: { type: Number, unique: true },
  order_id: { type: String, required: true },
  product_id: { type: Number, required: true },
  product_name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit_price: { type: Number, required: true },
  delivery_status: { type: String, default: 'pending' },
  delivery_message: { type: String, default: null },
});

const OrderItemModel = mongoose.model<IOrderItem>('OrderItem', orderItemSchema);

// ─── Inventory ───

interface IInventory {
  id: number;
  product_id: number;
  code: string;
  is_sold: boolean;
  sold_at: Date | null;
  order_id: string | null;
  buyer_id: string | null;
}

const inventorySchema = new Schema<IInventory>({
  id: { type: Number, unique: true },
  product_id: { type: Number, required: true },
  code: { type: String, required: true },
  is_sold: { type: Boolean, default: false },
  sold_at: { type: Date, default: null },
  order_id: { type: String, default: null },
  buyer_id: { type: String, default: null },
});

const InventoryModel = mongoose.model<IInventory>('Inventory', inventorySchema);

export async function addInventoryCode(productId: number, code: string) {
  const id = await nextId('inventory_id');
  await InventoryModel.create({ id, product_id: productId, code });
}

export async function addInventoryCodesBulk(productId: number, codes: string[]): Promise<number> {
  const start = await nextId('inventory_id', codes.length);
  const docs = codes.map((code, i) => ({
    id: start + i,
    product_id: productId,
    code,
  }));
  try {
    const result = await InventoryModel.insertMany(docs, { ordered: false });
    return result.length;
  } catch (e: any) {
    let inserted = 0;
    if (e?.writeErrors) {
      inserted = e.insertedDocs?.length || 0;
      console.error(`insertMany: ${inserted} inserted, ${e.writeErrors.length} failed`);
      for (const we of e.writeErrors) {
        console.error('  writeError:', we.err?.message || we.errmsg);
      }
    } else {
      console.error('insertMany error:', e?.message || e);
      throw e;
    }
    return inserted;
  }
}

export async function getAvailableCode(productId: number): Promise<InventoryItem | undefined> {
  const doc = await InventoryModel.findOne({ product_id: productId, is_sold: false }).sort({ id: 1 }).lean();
  return (doc as unknown as InventoryItem) ?? undefined;
}

export async function markCodeSold(id: number, orderId: string, buyerId: string) {
  await InventoryModel.updateOne(
    { id },
    { $set: { is_sold: true, sold_at: new Date(), order_id: orderId, buyer_id: buyerId } },
  );
}

export async function claimAvailableCode(productId: number, orderId: string, buyerId: string): Promise<InventoryItem | undefined> {
  const doc = await InventoryModel.findOneAndUpdate(
    { product_id: productId, is_sold: false },
    { $set: { is_sold: true, sold_at: new Date(), order_id: orderId, buyer_id: buyerId } },
    { sort: { id: 1 }, new: true },
  ).lean();
  return (doc as unknown as InventoryItem) ?? undefined;
}

export async function listInventoryCodes(productId: number): Promise<InventoryItem[]> {
  const docs = await InventoryModel.find({ product_id: productId }).sort({ id: 1 }).lean();
  return docs as unknown as InventoryItem[];
}

export async function removeInventoryCode(id: number) {
  await InventoryModel.deleteOne({ id });
}

export async function clearProductStock(productId: number) {
  await InventoryModel.deleteMany({ product_id: productId, is_sold: false });
}

export async function getInventoryCount(productId: number): Promise<{ available: number; sold: number }> {
  const result = await InventoryModel.aggregate([
    { $match: { product_id: productId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        sold: { $sum: { $cond: ['$is_sold', 1, 0] } },
      },
    },
  ]);
  if (result.length === 0) return { available: 0, sold: 0 };
  return { available: result[0].total - result[0].sold, sold: result[0].sold };
}

// ─── Permissions ───

interface IPermission {
  user_id: string;
  permission: string;
}

const permissionSchema = new Schema<IPermission>({
  user_id: { type: String, required: true },
  permission: { type: String, required: true },
});
permissionSchema.index({ user_id: 1, permission: 1 }, { unique: true });

const PermissionModel = mongoose.model<IPermission>('Permission', permissionSchema);

export async function setUserPermission(userId: string, permission: string, grant: boolean) {
  if (grant) {
    await PermissionModel.updateOne(
      { user_id: userId, permission },
      { $setOnInsert: { user_id: userId, permission } },
      { upsert: true },
    );
  } else {
    await PermissionModel.deleteOne({ user_id: userId, permission });
  }
}

export async function hasPermission(userId: string, permission: string): Promise<boolean> {
  const doc = await PermissionModel.findOne({ user_id: userId, permission });
  return !!doc;
}

// ─── Coupons ───

interface ICoupon {
  id: number;
  code: string;
  discount_percent: number;
  min_purchase: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
}

const couponSchema = new Schema<ICoupon>({
  id: { type: Number, unique: true },
  code: { type: String, required: true, unique: true },
  discount_percent: { type: Number, required: true },
  min_purchase: { type: Number, default: 0 },
  max_uses: { type: Number, default: 0 },
  used_count: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
});

const CouponModel = mongoose.model<ICoupon>('Coupon', couponSchema);

export async function createCoupon(code: string, discount: number, minPurchase: number, maxUses: number) {
  const id = await nextId('coupon_id');
  await CouponModel.create({ id, code, discount_percent: discount, min_purchase: minPurchase, max_uses: maxUses });
}

export async function getCoupon(code: string): Promise<Coupon | undefined> {
  const doc = await CouponModel.findOne({ code: code.toUpperCase(), is_active: true }).lean();
  return (doc as unknown as Coupon) ?? undefined;
}

export async function useCoupon(id: number) {
  await CouponModel.updateOne({ id }, { $inc: { used_count: 1 } });
}

export async function getAllCoupons() {
  return CouponModel.find().sort({ id: -1 }).lean();
}

export async function deleteCoupon(code: string) {
  await CouponModel.deleteOne({ code: code.toUpperCase() });
}

// ─── Giveaway ───

interface IGiveaway {
  user_id: string;
  channel_id: string;
}

const giveawaySchema = new Schema<IGiveaway>({
  user_id: { type: String, required: true },
  channel_id: { type: String, required: true },
});
giveawaySchema.index({ user_id: 1, channel_id: 1 }, { unique: true });

const GiveawayModel = mongoose.model<IGiveaway>('Giveaway', giveawaySchema);

export async function addGiveawayParticipant(userId: string, channelId: string) {
  await GiveawayModel.updateOne(
    { user_id: userId, channel_id: channelId },
    { $setOnInsert: { user_id: userId, channel_id: channelId } },
    { upsert: true },
  );
}

export async function getGiveawayParticipants(channelId: string): Promise<string[]> {
  const docs = await GiveawayModel.find({ channel_id: channelId }).lean();
  return docs.map(d => d.user_id);
}

// ─── Settings ───

interface ISetting {
  key: string;
  value: string;
}

const settingSchema = new Schema<ISetting>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
});

const SettingModel = mongoose.model<ISetting>('Setting', settingSchema);

export async function getSetting(key: string): Promise<string | undefined> {
  const doc = await SettingModel.findOne({ key }).lean();
  return doc?.value ?? undefined;
}

export async function setSetting(key: string, value: string) {
  await SettingModel.updateOne(
    { key },
    { $set: { value } },
    { upsert: true },
  );
}

// ─── Shop Channel ───

export async function setShopChannel(channelId: string) {
  await setSetting('shop_channel', channelId);
}

export async function getShopChannel(): Promise<string | undefined> {
  return getSetting('shop_channel');
}

// ─── Analytics ───

export async function getTotalRevenue(): Promise<number> {
  const result = await OrderModel.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$total_amount' } } },
  ]);
  return result.length > 0 ? result[0].total : 0;
}

export async function getOrderCount(): Promise<number> {
  return OrderModel.countDocuments();
}

export async function getTopProducts(limit = 5): Promise<{ name: string; total: number; count: number }[]> {
  const result = await OrderItemModel.aggregate([
    {
      $lookup: {
        from: 'products',
        localField: 'product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product_id',
        name: { $first: '$product.name' },
        total: { $sum: { $multiply: ['$unit_price', '$quantity'] } },
        count: { $sum: '$quantity' },
      },
    },
    { $sort: { total: -1 } },
    { $limit: limit },
  ]);
  return result;
}

// ─── UPI Addresses ───

interface IUPI {
  user_id: string;
  address: string;
}

const upiSchema = new Schema<IUPI>({
  user_id: { type: String, required: true, unique: true },
  address: { type: String, required: true },
});

const UPIModel = mongoose.model<IUPI>('UPI', upiSchema);

export async function setUPI(userId: string, address: string) {
  await UPIModel.updateOne({ user_id: userId }, { $set: { address } }, { upsert: true });
}

export async function getUPI(userId: string): Promise<string | undefined> {
  const doc = await UPIModel.findOne({ user_id: userId }).lean();
  return doc?.address;
}

// ─── LTC Addresses ───

interface ILTC {
  user_id: string;
  address: string;
}

const ltcSchema = new Schema<ILTC>({
  user_id: { type: String, required: true, unique: true },
  address: { type: String, required: true },
});

const LTCModel = mongoose.model<ILTC>('LTC', ltcSchema);

export async function setLTC(userId: string, address: string) {
  await LTCModel.updateOne({ user_id: userId }, { $set: { address } }, { upsert: true });
}

export async function getLTC(userId: string): Promise<string | undefined> {
  const doc = await LTCModel.findOne({ user_id: userId }).lean();
  return doc?.address;
}

export async function getLTCPrice(): Promise<{ inr: number; usd: number }> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=inr,usd');
    const data = await res.json() as any;
    return { inr: data.litecoin?.inr || 0, usd: data.litecoin?.usd || 0 };
  } catch {
    return { inr: 0, usd: 0 };
  }
}

export async function getLTCBalance(address: string): Promise<number> {
  try {
    const res = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${address}/balance`);
    const data = await res.json() as any;
    return data.balance ? data.balance / 1e8 : 0;
  } catch {
    return 0;
  }
}

export async function getLTCTxs(address: string, limit = 3): Promise<any[]> {
  try {
    const res = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${address}?limit=${limit}`);
    const data = await res.json() as any;
    return data.txrefs?.slice(0, limit) || [];
  } catch {
    return [];
  }
}

// ─── Merchant Payment Settings ───

export async function getMerchantUPI(): Promise<string> {
  return (await getSetting('merchant_upi')) || 'raut0@fam';
}

export async function setMerchantUPI(upi: string) {
  await setSetting('merchant_upi', upi);
}

export async function getMerchantLTC(): Promise<string> {
  return (await getSetting('merchant_ltc')) || 'ltc1qurcpq2e262424ghlag38nj3qqcnrasu4gt7y6x';
}

export async function setMerchantLTC(address: string) {
  await setSetting('merchant_ltc', address);
}

// ─── Payment Sessions (Token-based web payments) ───

interface IPaymentSession {
  token: string;
  orderId: string;
  userId: string;
  method: 'upi' | 'ltc';
  amount: number;
  currency: string;
  ltcAmount?: number;
  ltcPrice?: number;
  merchantUPI: string;
  merchantLTC: string;
  status: 'pending' | 'paid' | 'verified' | 'failed' | 'expired';
  utr?: string;
  txHash?: string;
  txData?: any;
  paidAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
  createdAt: Date;
  expiresAt: Date;
}

const paymentSessionSchema = new Schema<IPaymentSession>({
  token: { type: String, required: true, unique: true },
  orderId: { type: String, required: true },
  userId: { type: String, required: true },
  method: { type: String, enum: ['upi', 'ltc'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  ltcAmount: { type: Number },
  ltcPrice: { type: Number },
  merchantUPI: { type: String, required: true },
  merchantLTC: { type: String, required: true },
  status: { type: String, enum: ['pending', 'paid', 'verified', 'failed', 'expired'], default: 'pending' },
  utr: { type: String },
  txHash: { type: String },
  txData: { type: Schema.Types.Mixed },
  paidAt: { type: Date },
  verifiedAt: { type: Date },
  verifiedBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

const PaymentSessionModel = mongoose.model<IPaymentSession>('PaymentSession', paymentSessionSchema);

export type PaymentSession = IPaymentSession;

export async function createPaymentSession(token: string, data: {
  orderId: string;
  userId: string;
  method: 'upi' | 'ltc';
  amount: number;
  merchantUPI: string;
  merchantLTC: string;
  ltcAmount?: number;
  ltcPrice?: number;
}) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry
  await PaymentSessionModel.create({ token, ...data, expiresAt });
}

export async function getPaymentSession(token: string): Promise<IPaymentSession | null> {
  return PaymentSessionModel.findOne({ token }).lean();
}

export async function updatePaymentSession(token: string, updates: {
  status?: string;
  utr?: string;
  txHash?: string;
  txData?: any;
  paidAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
}) {
  const setData: any = {};
  const unsetData: any = {};
  for (const [key, val] of Object.entries(updates)) {
    if (val === undefined) {
      unsetData[key] = '';
    } else {
      setData[key] = val;
    }
  }
  const update: any = {};
  if (Object.keys(setData).length > 0) update.$set = setData;
  if (Object.keys(unsetData).length > 0) update.$unset = unsetData;
  await PaymentSessionModel.updateOne({ token }, update);
}

export async function getPaymentByOrder(orderId: string): Promise<IPaymentSession | null> {
  return PaymentSessionModel.findOne({ orderId }).lean();
}

export async function getPendingUPIPayments(): Promise<IPaymentSession[]> {
  return PaymentSessionModel.find({ method: 'upi', status: 'paid' }).sort({ createdAt: -1 }).lean();
}

export async function getAllPendingPayments(method?: string): Promise<IPaymentSession[]> {
  const filter: any = { status: { $in: ['pending', 'paid', 'verified'] } };
  if (method) filter.method = method;
  return PaymentSessionModel.find(filter).sort({ createdAt: -1 }).lean();
}

export async function getUserPaymentSessions(userId: string): Promise<IPaymentSession[]> {
  return PaymentSessionModel.find({ userId }).sort({ createdAt: -1 }).limit(10).lean();
}

export async function getExpiredPendingSessions(): Promise<IPaymentSession[]> {
  return PaymentSessionModel.find({
    status: 'pending',
    expiresAt: { $lt: new Date() },
  }).lean();
}

export async function expireStaleSessions() {
  await PaymentSessionModel.updateMany(
    { status: 'pending', expiresAt: { $lt: new Date() } },
    { $set: { status: 'expired' } }
  );
}

// ─── Verification System ───

export async function setVerifyChannel(channelId: string) {
  await setSetting('verify_channel', channelId);
}

export async function getVerifyChannel(): Promise<string | undefined> {
  return getSetting('verify_channel');
}

export async function setVerifyRole(roleId: string) {
  await setSetting('verify_role', roleId);
}

export async function getVerifyRole(): Promise<string | undefined> {
  return getSetting('verify_role');
}

export async function setVerifyMessage(messageId: string) {
  await setSetting('verify_message', messageId);
}

export async function getVerifyMessage(): Promise<string | undefined> {
  return getSetting('verify_message');
}
