// Mock database (in production, use a real database like MongoDB, PostgreSQL, etc.)
let users = [];
let apiKeys = [];
let paymentLinks = [];
let smsPermissions = [];

// Helper functions
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
const generateApiKey = () => 'pk_' + generateId() + Math.random().toString(36).substr(2);

const findUser = (id) => users.find(u => u.id === id);
const findApiKey = (key) => apiKeys.find(k => k.key === key);
const validateApiKey = (id, apikey) => {
  const user = findUser(id);
  const apiKey = findApiKey(apikey);
  return user && apiKey && apiKey.userId === id && apiKey.active;
};

export default async function handler(req, res) {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Route: /api/createid
    if (pathname === '/api/createid' && req.method === 'POST') {
      const { name, email } = req.body || {};
      const newId = generateId();
      users.push({ id: newId, name, email, createdAt: new Date() });
      return res.status(201).json({ success: true, id: newId, message: 'ID created successfully' });
    }

    // Route: /api/createapikey
    if (pathname === '/api/createapikey' && req.method === 'POST') {
      const { Id } = req.query;
      const user = findUser(Id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      
      const newApiKey = generateApiKey();
      apiKeys.push({ key: newApiKey, userId: Id, active: true, createdAt: new Date() });
      return res.status(201).json({ success: true, apikey: newApiKey });
    }

    // Route: /api/createpaymentlink
    if (pathname === '/api/createpaymentlink' && (req.method === 'POST' || req.method === 'GET')) {
      const { Id, apikey, amount } = req.method === 'GET' ? req.query : req.body;
      if (!validateApiKey(Id, apikey)) return res.status(401).json({ error: 'Invalid ID or API key' });
      if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Valid amount required' });
      
      const paymentLink = `https://payment-pi-one.vercel.app/payment.html?amount=${amount}&user=${Id}`;
      paymentLinks.push({ link: paymentLink, userId: Id, amount, status: 'pending', createdAt: new Date() });
      return res.status(200).json({ success: true, paymentlink: paymentLink });
    }

    // Route: /api/checkmassage (BKASH & NOGOD SMS support)
    if (pathname === '/api/checkmassage' && (req.method === 'GET' || req.method === 'POST')) {
      const { Id, apikey, paymentlink, amount } = req.method === 'GET' ? req.query : req.body;
      if (!validateApiKey(Id, apikey)) return res.status(401).json({ error: 'Invalid ID or API key' });
      
      // Check SMS permission from device
      const hasSmsPermission = smsPermissions.some(p => p.userId === Id && p.active);
      if (!hasSmsPermission) {
        return res.status(403).json({ 
          error: 'SMS permission required from device',
          requiresDevicePermission: true,
          message: 'Please grant SMS permission from your device settings'
        });
      }
      
      // Mock SMS check for BKASH and NOGOD
      const mockSmsData = {
        bkash: {
          supported: true,
          lastMessage: "Your bKash payment of Tk 500 to Merchant has been completed. TrxID: BK123456",
          status: "completed"
        },
        nogod: {
          supported: true,
          lastMessage: "Nagad: Tk 500 payment successful. Transaction ID: NG789012",
          status: "completed"
        }
      };
      
      return res.status(200).json({
        success: true,
        supportedProviders: ['BKASH', 'NOGOD'],
        smsData: mockSmsData,
        paymentLink: paymentlink,
        amount: amount,
        requiresDevicePermission: false
      });
    }

    // Route: /api/payment-status
    if (pathname === '/api/payment-status' && (req.method === 'GET' || req.method === 'POST')) {
      const { Id, apikey, paymentlink, amount } = req.method === 'GET' ? req.query : req.body;
      if (!validateApiKey(Id, apikey)) return res.status(401).json({ error: 'Invalid ID or API key' });
      
      const payment = paymentLinks.find(p => p.link === paymentlink && p.userId === Id);
      if (!payment) return res.status(404).json({ error: 'Payment link not found' });
      
      const isPaid = payment.status === 'completed';
      return res.status(200).json({
        payment: isPaid ? 'done' : 'no',
        status: payment.status,
        amount: payment.amount
      });
    }

    // Route: /api/SMSpermission (FIXED - supports both GET and POST)
    if (pathname === '/api/SMSpermission') {
      if (req.method === 'POST') {
        const { Id, apikey, grant } = req.body;
        if (!validateApiKey(Id, apikey)) return res.status(401).json({ error: 'Invalid ID or API key' });
        
        if (grant === true) {
          // Remove existing permission if any
          const existingIndex = smsPermissions.findIndex(p => p.userId === Id);
          if (existingIndex !== -1) {
            smsPermissions[existingIndex] = { userId: Id, active: true, grantedAt: new Date() };
          } else {
            smsPermissions.push({ userId: Id, active: true, grantedAt: new Date() });
          }
          return res.status(200).json({ 
            success: true, 
            message: 'SMS permission granted. You can now receive SMS notifications for BKASH and NOGOD.'
          });
        } else {
          return res.status(400).json({ error: 'SMS permission required for this operation' });
        }
      } else if (req.method === 'GET') {
        // GET request returns current permission status
        const { Id, apikey } = req.query;
        if (!validateApiKey(Id, apikey)) return res.status(401).json({ error: 'Invalid ID or API key' });
        
        const hasPermission = smsPermissions.some(p => p.userId === Id && p.active);
        return res.status(200).json({
          success: true,
          hasSmsPermission: hasPermission,
          message: hasPermission ? 'SMS permission is granted' : 'SMS permission not granted yet'
        });
      }
    }

    // Route: /api/enteramount
    if (pathname === '/api/enteramount' && (req.method === 'POST' || req.method === 'GET')) {
      const { apikey, enteramount } = req.method === 'GET' ? req.query : req.body;
      const apiKey = findApiKey(apikey);
      if (!apiKey) return res.status(401).json({ error: 'Invalid API key' });
      
      if (!enteramount || isNaN(enteramount)) return res.status(400).json({ error: 'Valid amount required' });
      
      return res.status(200).json({
        success: true,
        amount: enteramount,
        message: `Amount ${enteramount} processed successfully`,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(404).json({ error: 'Endpoint not found' });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
