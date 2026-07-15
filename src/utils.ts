export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toFixed(2)}`;
}

export async function generateOrderId(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempt = 0; attempt < 3; attempt++) {
    let result = 'ORD-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const { exists } = await import('./database.js');
    const dup = await exists('order', result);
    if (!dup) return result;
  }
  return 'ORD-' + Date.now().toString(36).toUpperCase();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
