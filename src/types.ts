export interface Category {
  id: number;
  name: string;
  description: string;
  emoji: string;
}

export interface Product {
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

export interface CartItem {
  id: number;
  user_id: string;
  product_id: number;
  quantity: number;
  slot_id: string;
  product_name: string;
  product_price: number;
}

export interface Order {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  delivery_status: string;
  delivery_message: string | null;
}

export interface InventoryItem {
  id: number;
  product_id: number;
  code: string;
  is_sold: boolean;
  sold_at: string | null;
  order_id: string | null;
  buyer_id: string | null;
}

export interface Coupon {
  id: number;
  code: string;
  discount_percent: number;
  min_purchase: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
}
