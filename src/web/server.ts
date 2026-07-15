import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from '../database.js';
import { deliverOrderItems, sendDeliveryDM } from '../handlers/modals.js';
import { updateVendingPanel } from '../handlers/vending.js';
import { creditReferralReward } from '../handlers/referral.js';
import { logPurchase } from '../handlers/logger.js';
import { auth, escapeHtml, loginHandler, rateLimit } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Bot client reference (set after login)
let botClient: any = null;

export function setBotClient(client: any) {
  botClient = client;
}

// ─── Admin Endpoints ───

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/login', loginHandler);

app.get('/api/categories', auth, async (_, res) => {
  try {
    const cats = await db.getCategories();
    res.json(cats.map(c => ({ id: c.id, name: c.name, emoji: c.emoji })));
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/categories', auth, async (req, res) => {
  try {
    const { name, description, emoji } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const id = await db.createCategory(name, description || '', emoji || '\u{1F3EA}');
    res.json({ id, name, description, emoji });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/categories/:id', auth, async (req, res) => {
  try {
    const catId = parseInt(String(req.params.id));
    const { name, description, emoji } = req.body;
    await db.updateCategory(catId, { name, description, emoji });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/products', auth, async (req, res) => {
  try {
    const { slot_id, name, description, price, price_usd, category_id, stock } = req.body;
    if (!slot_id || !name || price === undefined || category_id === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    await db.addProduct(slot_id, name, description || '', Number(price), Number(category_id), stock !== undefined ? Number(stock) : -1, price_usd !== undefined ? Number(price_usd) : undefined);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/products', auth, async (req, res) => {
  try {
    const products = await db.getAllProducts();
    const categories = await db.getCategories();
    const catMap = new Map(categories.map(c => [c.id, c]));
    const data = await Promise.all(products.map(async p => {
      const cnt = await db.getInventoryCount(p.id);
      const cat = catMap.get(p.category_id);
      return {
        id: p.id, slot_id: p.slot_id, name: p.name, price: p.price, price_usd: p.price_usd,
        stock: p.stock, category: cat?.name || 'Unknown',
        category_emoji: cat?.emoji || '', is_active: p.is_active,
        available_codes: cnt.available, sold_codes: cnt.sold,
      };
    }));
    res.json(data);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/products/:id/stock', auth, async (req, res) => {
  try {
    const productId = parseInt(String(req.params.id));
    const { codes } = req.body;
    if (!codes || !Array.isArray(codes) || codes.length === 0) return res.status(400).json({ error: 'No codes' });
    const product = await db.getProductById(productId);
    if (!product) return res.status(404).json({ error: 'Not found' });
    const added = await db.addInventoryCodesBulk(productId, codes);
    const cnt = await db.getInventoryCount(productId);
    if (botClient) updateVendingPanel(botClient);
    res.json({ added, available: cnt.available, sold: cnt.sold, product: product.name });
  } catch (e: any) {
    console.error('Stock upload error:', e?.message || e);
    res.status(500).json({ error: 'Server error', detail: e?.message || 'Unknown' });
  }
});

app.patch('/api/products/:id', auth, async (req, res) => {
  try {
    const productId = parseInt(String(req.params.id));
    const product = await db.getProductById(productId);
    if (!product) return res.status(404).json({ error: 'Not found' });
    const { name, price, price_usd, stock, description, how_to_use, slot_id, category_id } = req.body;
    const fields: any = {};
    if (name !== undefined) fields.name = name;
    if (price !== undefined) fields.price = Number(price);
    if (price_usd !== undefined) fields.price_usd = Number(price_usd);
    if (stock !== undefined) fields.stock = Number(stock);
    if (description !== undefined) fields.description = description;
    if (how_to_use !== undefined) fields.how_to_use = how_to_use;
    if (slot_id !== undefined) fields.slot_id = slot_id;
    if (category_id !== undefined) fields.category_id = Number(category_id);
    await db.editProduct(product.slot_id, fields);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/inventory/:id', auth, async (req, res) => {
  try {
    const codeId = parseInt(String(req.params.id));
    if (isNaN(codeId)) return res.status(400).json({ error: 'Invalid ID' });
    await db.removeInventoryCode(codeId);
    res.json({ success: true });
  } catch (err) { console.error('Delete inventory error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/products/:id/stock', auth, async (req, res) => {
  try {
    const productId = parseInt(String(req.params.id));
    if (isNaN(productId)) return res.status(400).json({ error: 'Invalid ID' });
    await db.clearProductStock(productId);
    if (botClient) updateVendingPanel(botClient);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/products/:id', auth, async (req, res) => {
  try {
    const productId = parseInt(String(req.params.id));
    if (isNaN(productId)) return res.status(400).json({ error: 'Invalid ID' });
    const product = await db.getProductById(productId);
    if (!product) return res.status(404).json({ error: 'Not found' });
    await db.removeProduct(product.slot_id);
    res.json({ success: true });
  } catch (err) { console.error('Delete product error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/products/:id/inventory', auth, async (req, res) => {
  try {
    const productId = parseInt(String(req.params.id));
    const product = await db.getProductById(productId);
    if (!product) return res.status(404).json({ error: 'Not found' });
    const codes = await db.listInventoryCodes(productId);
    res.json({
      product: product.name, slot_id: product.slot_id,
      codes: codes.map(c => ({ id: c.id, code: c.code, is_sold: c.is_sold, sold_at: c.sold_at, buyer_id: c.buyer_id })),
    });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/payments', auth, async (_, res) => {
  try {
    const payments = await db.getAllPendingPayments();
    res.json(payments.map(p => ({
      token: p.token, orderId: p.orderId?.slice(0, 8), userId: p.userId,
      method: p.method, amount: p.amount, status: p.status,
      utr: p.utr, txHash: p.txHash?.slice(0, 16),
      createdAt: p.createdAt, paidAt: p.paidAt,
    })));
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/payments/verify', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const session = await db.getPaymentByOrder(orderId);
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (session.status !== 'paid') return res.status(400).json({ error: `Status is ${session.status}` });

    await db.updatePaymentSession(session.token, { status: 'verified', verifiedAt: new Date() });
    const { allDelivered } = await deliverOrderItems(session.orderId, session.userId);
    await db.updateTotalSpent(session.userId, session.amount);
    if (botClient && allDelivered) {
      await sendDeliveryDM(botClient, session.orderId, session.userId);
    }
    if (botClient) updateVendingPanel(botClient);
    creditReferralReward(session.userId, session.amount);
    const orderItems = await db.getOrderItems(session.orderId);
    if (botClient) logPurchase(botClient, {
      buyerId: session.userId, total: session.amount, method: session.method || 'balance', orderId: session.orderId,
      items: orderItems.map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price })),
      status: 'verified',
    });
    res.json({ success: true, allDelivered });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ─── Payment Page (Public) ───

const PAYMENT_PAGE_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0d1117; color:#e6edf3; min-height:100vh; display:flex; align-items:center; justify-content:center; }
.card { background:#161b22; border:1px solid #30363d; border-radius:16px; padding:32px; max-width:480px; width:90%; margin:20px; }
.card h1 { font-size:22px; margin-bottom:8px; }
.card .sub { color:#8b949e; font-size:14px; margin-bottom:24px; }
.detail { background:#0d1117; border:1px solid #21262d; border-radius:8px; padding:12px 16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; }
.detail .label { color:#8b949e; font-size:13px; }
.detail .value { font-size:15px; font-weight:600; }
.detail .mono { font-family:'SFMono-Regular',Consolas,monospace; font-size:13px; word-break:break-all; }
.qr-wrap { text-align:center; margin:20px 0; }
.qr-wrap img { width:220px; height:220px; border-radius:8px; background:#fff; padding:8px; }
input, button { width:100%; padding:12px 16px; border-radius:8px; border:1px solid #30363d; font-size:14px; background:#0d1117; color:#e6edf3; margin-bottom:12px; }
input:focus { outline:none; border-color:#58a6ff; }
button { background:#238636; border-color:#2ea043; font-weight:600; cursor:pointer; transition:.2s; }
button:hover { background:#2ea043; }
button:disabled { opacity:.6; cursor:not-allowed; }
.msg { padding:12px 16px; border-radius:8px; margin-bottom:12px; font-size:14px; }
.msg.ok { background:#1b3d20; border:1px solid #2ea043; color:#7ee787; }
.msg.err { background:#3d1b1b; border:1px solid #da3633; color:#ff7b72; }
.msg.info { background:#1b2d3d; border:1px solid #1f6feb; color:#79c0ff; }
.fade { animation:fadeIn .3s; }
@keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
`;

function paymentPage(token: string, session: any) {
  const isUPI = session.method === 'upi';
  const isLTC = session.method === 'ltc';
  const expired = session.status === 'expired';
  const paid = session.status === 'paid' || session.status === 'verified';

  const safeToken = escapeHtml(token);
  const safeOrderId = escapeHtml(session.orderId?.slice(0, 8) || '');
  const safeAmount = escapeHtml(String(session.amount || ''));
  const safeMerchantUPI = escapeHtml(session.merchantUPI || '');
  const safeMerchantLTC = escapeHtml(session.merchantLTC || '');
  const safeLtcAmount = session.ltcAmount ? escapeHtml(session.ltcAmount.toFixed(6)) : '';
  const safeLtcPrice = session.ltcPrice ? escapeHtml(session.ltcPrice.toLocaleString()) : '';

  const upiLink = isUPI ? `upi://pay?pa=${session.merchantUPI}&pn=Mega Bazar&am=${session.amount}&cu=INR&tn=Order${session.orderId.slice(0, 8)}` : '';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(isLTC ? `litecoin:${session.merchantLTC}?amount=${session.ltcAmount?.toFixed(6)}` : upiLink)}`;

  if (expired) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Expired</title><style>${PAYMENT_PAGE_CSS}</style></head><body><div class="card fade"><div class="msg err">This payment session has expired.</div></div></body></html>`;
  }

  if (paid) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Complete</title><style>${PAYMENT_PAGE_CSS}</style></head><body><div class="card fade"><h1>✅ Payment Complete</h1><p class="sub">Your order has been processed and items delivered.</p></div></body></html>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pay - Mega Bazar</title>
  <style>${PAYMENT_PAGE_CSS}</style>
</head>
<body>
<div class="card fade" id="app">
  <h1>${isUPI ? '\u{1F4B1}' : '\u{1F3E6}'} ${isUPI ? 'Pay via UPI' : 'Pay with Litecoin'}</h1>
  <p class="sub">Order ${safeOrderId}</p>

  <div class="detail">
    <span class="label">Amount</span>
    <span class="value">\u{20B9}${safeAmount}${isLTC ? ` (${safeLtcAmount} LTC)` : ''}</span>
  </div>

  <div class="detail">
    <span class="label">${isUPI ? 'UPI ID' : 'LTC Address'}</span>
    <span class="value mono">${isUPI ? safeMerchantUPI : safeMerchantLTC}</span>
  </div>

  ${isLTC ? `<div class="detail"><span class="label">Rate</span><span class="value">1 LTC = \u{20B9}${safeLtcPrice}</span></div>` : ''}

  <div class="qr-wrap">
    <img src="${qrUrl}" alt="QR Code">
  </div>

  <div id="status"></div>

  ${isUPI ? `
  <p style="color:#8b949e;font-size:13px;margin-bottom:12px">Pay using any UPI app, then enter the UTR/Reference number below.</p>
  <input type="text" id="utr" placeholder="Enter UTR / Reference number" ${paid ? 'disabled' : ''}>
  <button id="submitBtn" onclick="submitUTR()" ${paid ? 'disabled' : ''}>Confirm Payment</button>
  ` : `
  <p style="color:#8b949e;font-size:13px;margin-bottom:12px">Send the exact LTC amount to the address above, then enter the transaction hash below.</p>
  <input type="text" id="txhash" placeholder="Enter LTC transaction hash (TXID)" ${paid ? 'disabled' : ''}>
  <button id="submitBtn" onclick="submitTXHash()" ${paid ? 'disabled' : ''}>Confirm Payment</button>
  `}

  <p style="color:#484f58;font-size:12px;margin-top:8px;text-align:center">This session expires in 60 minutes.</p>
</div>

<script>
function showMsg(type, text) {
  document.getElementById('status').innerHTML = '<div class="msg ' + type + '">' + text + '</div>';
}
${isUPI ? `
async function submitUTR() {
  const utr = document.getElementById('utr').value.trim();
  if (utr.length < 4) { showMsg('err', 'Please enter a valid UTR'); return; }
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('submitBtn').textContent = 'Verifying...';
  try {
    const r = await fetch('/api/pay/submit', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ token:'${safeToken}', utr })
    });
    const d = await r.json();
    if (d.success) {
      showMsg('ok', 'Payment verified! Items delivered. Check your Discord DM.');
      document.getElementById('submitBtn').textContent = 'Done';
    } else {
      showMsg('err', d.error || 'Verification failed');
      document.getElementById('submitBtn').disabled = false;
      document.getElementById('submitBtn').textContent = 'Try Again';
    }
  } catch(e) {
    showMsg('err', 'Server error. Try again.');
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('submitBtn').textContent = 'Confirm Payment';
  }
}
` : `
async function submitTXHash() {
  const txhash = document.getElementById('txhash').value.trim();
  if (txhash.length < 10) { showMsg('err', 'Please enter a valid transaction hash'); return; }
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('submitBtn').textContent = 'Verifying on Blockchain...';
  try {
    const r = await fetch('/api/pay/submit', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ token:'${safeToken}', txHash:txhash })
    });
    const d = await r.json();
    if (d.success) {
      showMsg('ok', 'Transaction verified! Items delivered. Check your Discord DM.');
      document.getElementById('submitBtn').textContent = 'Done';
    } else {
      showMsg('err', d.error || 'Verification failed');
      document.getElementById('submitBtn').disabled = false;
      document.getElementById('submitBtn').textContent = 'Try Again';
    }
  } catch(e) {
    showMsg('err', 'Server error. Try again.');
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('submitBtn').textContent = 'Confirm Payment';
  }
}
`}
</script>
</body>
</html>`;
}

app.get('/pay/:token', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    const { token } = req.params;
    const session = await db.getPaymentSession(token);
    if (!session) {
      return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not Found</title><style>${PAYMENT_PAGE_CSS}</style></head><body><div class="card fade"><div class="msg err">Payment session not found.</div></div></body></html>`);
    }
    res.send(paymentPage(token, session));
  } catch {
    res.status(500).send('Server error');
  }
});

app.post('/api/pay/submit', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`pay:${ip}`)) {
    return res.json({ success: false, error: 'Too many requests. Try again later.' });
  }
  try {
    const { token, utr, txHash } = req.body;
    if (typeof token !== 'string') return res.json({ success: false, error: 'Invalid token' });

    const session = await db.getPaymentSession(token);
    if (!session) return res.json({ success: false, error: 'Session not found' });
    if (session.status !== 'pending') return res.json({ success: false, error: `Already ${session.status}` });
    if (new Date() > session.expiresAt) {
      await db.updatePaymentSession(token, { status: 'expired' });
      return res.json({ success: false, error: 'Session expired' });
    }

    // UPI flow
    if (session.method === 'upi') {
      if (!utr || utr.length < 4 || utr.length > 60 || /[<>"'&]/.test(utr)) {
        return res.json({ success: false, error: 'Invalid UTR format.' });
      }
      // Check if UTR already used
      const existingPayments = await db.getAllPendingPayments('upi');
      const duplicateUTR = existingPayments.find((p: any) => p.utr === utr && p.status !== 'failed');
      if (duplicateUTR) return res.json({ success: false, error: 'UTR already used for another payment' });

      await db.updatePaymentSession(token, { status: 'paid', utr, paidAt: new Date() });
      const autoVerify = process.env.UPI_AUTO_VERIFY !== 'false';
      if (autoVerify) {
        const { allDelivered } = await deliverOrderItems(session.orderId, session.userId);
        await db.updatePaymentSession(token, { status: 'verified', verifiedAt: new Date() });
        await db.updateTotalSpent(session.userId, session.amount);
        await db.clearCart(session.userId);

        if (botClient) {
          await sendDeliveryDM(botClient, session.orderId, session.userId);
        }
        if (botClient) updateVendingPanel(botClient);
        creditReferralReward(session.userId, session.amount);
        const upiOrderItems = await db.getOrderItems(session.orderId);
        if (botClient) logPurchase(botClient, {
          buyerId: session.userId, total: session.amount, method: 'upi', orderId: session.orderId,
          items: upiOrderItems.map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price })),
          status: 'verified',
        });
        return res.json({ success: true, allDelivered });
      } else {
        return res.json({ success: true, allDelivered: false, message: 'Payment recorded. Awaiting admin verification.' });
      }
    }

    // LTC flow
    if (session.method === 'ltc') {
      if (!txHash || txHash.length < 10) return res.json({ success: false, error: 'Invalid transaction hash' });

      // Check duplicate txHash
      const existingLTC = await db.getAllPendingPayments('ltc');
      const dupTx = existingLTC.find((p: any) => p.txHash === txHash && p.status !== 'failed');
      if (dupTx) return res.json({ success: false, error: 'Transaction hash already used' });

      // Verify via BlockCypher
      const txRes = await fetch(`https://api.blockcypher.com/v1/ltc/main/txs/${txHash}`);
      if (!txRes.ok) return res.json({ success: false, error: 'Transaction not found on blockchain' });

      const txData = await txRes.json();
      if (txData.double_spend) return res.json({ success: false, error: 'Double-spend detected! Transaction is invalid.' });
      if (txData.confirmations < 1) return res.json({ success: false, error: 'Transaction has 0 confirmations. Wait and try again.' });

      // Check if amount matches (output to merchant address)
      let matchedAmount = 0;
      let addressMatch = false;
      for (const output of txData.outputs || []) {
        if ((output.addresses || []).includes(session.merchantLTC)) {
          matchedAmount += output.value / 1e8;
          addressMatch = true;
        }
      }
      if (!addressMatch) return res.json({ success: false, error: 'Transaction does not send to our LTC address' });

      const expected = session.ltcAmount || 0;
      const tolerance = 0.001;
      if (matchedAmount < expected - tolerance) {
        return res.json({ success: false, error: `Amount mismatch. Expected ${expected.toFixed(6)} LTC, got ${matchedAmount.toFixed(6)} LTC` });
      }

      await db.updatePaymentSession(token, { status: 'paid', txHash, txData, paidAt: new Date() });
      const { allDelivered } = await deliverOrderItems(session.orderId, session.userId);
      await db.updatePaymentSession(token, { status: 'verified', verifiedAt: new Date() });
      await db.updateTotalSpent(session.userId, session.amount);
      await db.clearCart(session.userId);

      if (botClient) {
        await sendDeliveryDM(botClient, session.orderId, session.userId);
      }
      if (botClient) updateVendingPanel(botClient);
      creditReferralReward(session.userId, session.amount);
      const ltcOrderItems = await db.getOrderItems(session.orderId);
      if (botClient) logPurchase(botClient, {
        buyerId: session.userId, total: session.amount, method: 'ltc', orderId: session.orderId,
        items: ltcOrderItems.map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price })),
        status: 'verified',
      });

      return res.json({ success: true, allDelivered });
    }

    return res.json({ success: false, error: 'Unknown method' });
  } catch (err: any) {
    console.error('Payment submit error:', err);
    res.json({ success: false, error: 'Server error' });
  }
});

// ─── Verify Endpoint (Cloudflare Turnstile) ───

app.post('/api/verify', async (req, res) => {
  try {
    const { token, userId, guildId } = req.body;
    if (typeof token !== 'string' || typeof userId !== 'string' || typeof guildId !== 'string') {
      return res.status(400).json({ error: 'Invalid fields' });
    }

    // Verify Turnstile token with Cloudflare
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return res.status(500).json({ error: 'Captcha not configured' });
    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);
    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const cfData: any = await cfRes.json();
    if (!cfData.success) {
      return res.status(400).json({ error: 'Captcha failed. Try again.' });
    }

    if (!botClient) {
      return res.status(500).json({ error: 'Bot not ready' });
    }

    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(400).json({ error: 'Guild not found' });
    }

    const verifyRoleId = await db.getVerifyRole();
    if (!verifyRoleId) {
      return res.status(500).json({ error: 'Verify role not configured' });
    }

    try {
      const member = await guild.members.fetch(userId);
      await member.roles.add(verifyRoleId);
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(400).json({ error: 'Could not assign role. Are you in the server?' });
    }
  } catch (err: any) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Start Server ───

export function startWebServer(port = parseInt(process.env.WEB_PORT || '8080')) {
  app.listen(port, () => {
    console.log(`Web panel: http://localhost:${port}`);
    // Expire stale sessions every 10 min
    setInterval(() => db.expireStaleSessions().catch(() => {}), 10 * 60 * 1000);
  });
}
