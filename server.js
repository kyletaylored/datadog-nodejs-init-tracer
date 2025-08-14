// server.js
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Useful envs for Datadog RUM
const {
    DD_APPLICATION_ID = '',
    DD_CLIENT_TOKEN = '',
    DD_SERVICE = 'datadog-nodejs-init-tracer',
    DD_ENV = 'local',
    DD_VERSION = '0.1.0',
    DD_SITE = 'datadoghq.com', // e.g. datadoghq.com, datadoghq.eu, us3.datadoghq.com, ddog-gov.com
} = process.env;

// Helper: generate the RUM snippet only if we have the essentials
function rumSnippet() {
    if (!DD_APPLICATION_ID || !DD_CLIENT_TOKEN) return '';
    return `
    <script src="https://www.datadoghq-browser-agent.com/us1/v6/datadog-rum.js"></script>
    <script>
      if (window.DD_RUM) {
        window.DD_RUM.init({
          applicationId: ${JSON.stringify(DD_APPLICATION_ID)},
          clientToken: ${JSON.stringify(DD_CLIENT_TOKEN)},
          site: ${JSON.stringify(DD_SITE)},
          service: ${JSON.stringify(DD_SERVICE)},
          env: ${JSON.stringify(DD_ENV)},
          version: ${JSON.stringify(DD_VERSION)},
          sessionSampleRate: 100,
          sessionReplaySampleRate: 20,
          defaultPrivacyLevel: 'mask-user-input',
        });
      }
    </script>
  `;
}

// Home UI (Bootstrap + buttons calling API via fetch)
app.get('/', (_req, res) => {
    const html = `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>datadog-nodejs-init-tracer</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
    </head>
    <body class="bg-light">
      <div class="container py-5">
        <div class="row justify-content-center">
          <div class="col-lg-8">
            <div class="card shadow-sm border-0">
              <div class="card-body p-4">
                <h1 class="h3 mb-3">datadog-nodejs-init-tracer</h1>
                <p class="text-muted">Express app with API endpoints, Datadog APM (dd-trace) & optional RUM.</p>

                <div class="alert alert-info" role="alert">
                  <strong>RUM status:</strong>
                  ${DD_APPLICATION_ID && DD_CLIENT_TOKEN ? 'Enabled' : 'Disabled (missing DD_APPLICATION_ID and/or DD_CLIENT_TOKEN)'}
                </div>

                <div class="d-flex gap-2 flex-wrap mb-3">
                  <button id="btn-random" class="btn btn-primary">Fetch /api/random</button>
                  <button id="btn-health" class="btn btn-success">Fetch /api/health</button>
                  <button id="btn-error" class="btn btn-danger">Trigger 400</button>
                  <button id="btn-work" class="btn btn-secondary">Do /api/work</button>
                </div>

                <pre id="output" class="bg-dark text-white p-3 rounded" style="min-height: 160px;">
Click a button to see the response here…
                </pre>

                <hr />
                <div class="small text-muted">
                  <div>Service: ${DD_SERVICE}</div>
                  <div>Env: ${DD_ENV}</div>
                  <div>Version: ${DD_VERSION}</div>
                  <div>Site: ${DD_SITE}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        const out = document.getElementById('output');
        function show(obj) { out.textContent = JSON.stringify(obj, null, 2); }

        document.getElementById('btn-random').onclick = async () => {
          try {
            const r = await fetch('/api/random');
            show(await r.json());
          } catch (e) { show({ error: String(e) }); }
        };
        document.getElementById('btn-health').onclick = async () => {
          try {
            const r = await fetch('/api/health');
            show(await r.json());
          } catch (e) { show({ error: String(e) }); }
        };
        document.getElementById('btn-error').onclick = async () => {
          try {
            const r = await fetch('/api/random?forceStatus=400');
            const body = await r.text();
            show({ status: r.status, body });
          } catch (e) { show({ error: String(e) }); }
        };
        document.getElementById('btn-work').onclick = async () => {
          try {
            const r = await fetch('/api/work?ms=500');
            show(await r.json());
          } catch (e) { show({ error: String(e) }); }
        };
      </script>

      ${rumSnippet()}
    </body>
  </html>`;

    res.set('Content-Type', 'text/html').send(html);
});

// API: random response
const RANDOM_STRINGS = [
    'Hello, Datadog!',
    'Meow 🐾',
    'Woof 🐶',
    '42',
    'Latency is a feature (jk)',
    'Ship it 🚀',
    'Semicolons are optional… are they?'
];

app.get('/api/random', (req, res) => {
    // Optionally simulate error for testing
    const force = Number(req.query.forceStatus);
    if (force && !Number.isNaN(force)) {
        return res.status(force).send(`Forced status: ${force}`);
    }

    // Small random delay to make things interesting in traces
    const delay = Math.floor(Math.random() * 400);
    setTimeout(() => {
        const payload = {
            ts: new Date().toISOString(),
            random: RANDOM_STRINGS[Math.floor(Math.random() * RANDOM_STRINGS.length)],
            requestId: Math.random().toString(36).slice(2, 10),
            delayMs: delay,
        };
        res.json(payload);
    }, delay);
});

// API: health check
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptimeSec: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// API: simple CPU work (to see spans/metrics)
app.get('/api/work', (req, res) => {
    const ms = Math.min(5000, Math.max(0, Number(req.query.ms) || 250));
    const start = Date.now();
    // Busy loop to simulate CPU (kept small; not for prod)
    while (Date.now() - start < ms) Math.sqrt(Math.random() * 1e6);
    res.json({ status: 'done', workMs: ms });
});

// 404 for other API paths
app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
});