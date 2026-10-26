const express = require('express');
const client = require('prom-client');

const app = express();
client.collectDefaultMetrics();   // Node process CPU, memory, event loop lag, GC...

// --- Custom metrics -------------------------------------------------
const httpRequests = new client.Counter({
  name: 'myapp_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});
const httpDuration = new client.Histogram({
  name: 'myapp_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5],
});
const ordersCreated = new client.Counter({
  name: 'myapp_orders_created_total',
  help: 'Orders successfully created',
});
const queueSize = new client.Gauge({
  name: 'myapp_queue_size',
  help: 'Jobs waiting in the (fake) queue',
});
setInterval(() => queueSize.set(Math.floor(Math.random() * 50)), 5000);

// --- Middleware: measure every request -------------------------------
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    if (req.path === '/metrics') return;
    const labels = {
      method: req.method,
      route: req.route ? req.route.path : 'unmatched',
      status: res.statusCode,
    };
    httpRequests.inc(labels);
    end(labels);
  });
  next();
});

// --- Routes -------------------------------------------------------------
app.get('/', (req, res) => res.json({ message: 'Hello from myapp' }));

app.get('/api/order', async (req, res) => {
  await new Promise(r => setTimeout(r, 50 + Math.random() * 700));
  if (Math.random() < 0.1) return res.status(500).json({ error: 'payment failed' });
  ordersCreated.inc();
  res.json({ ok: true });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(4000, '127.0.0.1', () => console.log('myapp listening on 4000'));
