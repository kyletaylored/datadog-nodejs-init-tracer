# datadog-nodejs-init-tracer

A tiny Node.js/Express app for validating Datadog **APM** (via `dd-trace`), **RUM** (optional browser snippet), and containerized runtime env wiring. It exposes a few API endpoints, a simple Bootstrap UI that calls them via `fetch`, and is meant to be run in Docker (optionally with docker-compose and a Datadog Agent).

## Why this exists

- **Prove “init” mode** for Datadog Node.js tracing using `--require dd-trace/init` (no app-code changes to import the tracer).
- **Exercise runtime env vars** passed in by the container runtime (service, env, version, site, RUM tokens).
- **Generate traffic** (success, error, and small CPU work) to see spans, traces, and RUM events land in Datadog.

## How tracing is enabled

Your Dockerfile uses the Node “require at startup” pattern:

```Dockerfile
CMD ["node", "--require", "dd-trace/init", "server.js"]
```

This auto-initializes the tracer before your app code runs. The tracer reads standard `DD_*` environment variables at runtime (e.g., `DD_SERVICE`, `DD_ENV`, `DD_VERSION`, `DD_AGENT_HOST`, `DD_TRACE_AGENT_PORT`).

## RUM (optional)

The home page includes a RUM snippet that only initializes if both **`DD_APPLICATION_ID`** and **`DD_CLIENT_TOKEN`** are set. It reports basic page views, interactions, and session replay (if available) to the Datadog site defined by **`DD_SITE`**.

## Endpoints

- `GET /` — Bootstrap UI with buttons calling the API via `fetch` (also shows whether RUM is enabled).
- `GET /api/health` — Health JSON: `{ status: "ok", uptimeSec: <number> }`.
- `GET /api/random` — Returns a random payload. Accepts `?forceStatus=400` (or any code) to simulate errors.
- `GET /api/work?ms=500` — Busy loop for the specified milliseconds (cap \~5s) to create a small CPU span.

## Environment variables

The app and tracer honor standard Datadog envs. Typical ones you’ll use:

- `DD_SERVICE` — Logical service name (default: `datadog-nodejs-init-tracer` in Dockerfile).
- `DD_ENV` — Deployment environment (e.g., `dev`, `staging`, `prod`).
- `DD_VERSION` — App version string.
- `DD_SITE` — Your Datadog site (e.g., `datadoghq.com`, `datadoghq.eu`, `us3.datadoghq.com`, `us5.datadoghq.com`, `ddog-gov.com`).
- `DD_AGENT_HOST` / `DD_TRACE_AGENT_PORT` — Where the tracer sends traces (e.g., `datadog-agent:8126` when using compose).
- `DD_APPLICATION_ID` / `DD_CLIENT_TOKEN` — **RUM only**; if both are present, the UI initializes RUM.
- `PORT` — Web server port (container exposes `3000`).

> Build-time defaults (`ARG`) are provided in the Dockerfile for convenience, but **runtime env values win**.

## Quick start

### Docker (single container)

```bash
# Build
docker build -t datadog-nodejs-init-tracer:latest .

# Run (set whatever you need at runtime)
docker run --rm -p 3000:3000 \
  -e DD_SERVICE=datadog-nodejs-init-tracer \
  -e DD_ENV=dev \
  -e DD_VERSION=1.0.0 \
  -e DD_SITE=datadoghq.com \
  # Optional RUM (uncomment if you want it)
  # -e DD_APPLICATION_ID=your_app_id \
  # -e DD_CLIENT_TOKEN=your_client_token \
  # If pointing to a local/remote Agent, include:
  # -e DD_AGENT_HOST=host.docker.internal -e DD_TRACE_AGENT_PORT=8126 \
  datadog-nodejs-init-tracer:latest

# open http://localhost:3000
```

### Docker Compose (recommended for APM)

Use a compose file that runs a Datadog Agent (APM on 8126) alongside the app. Example env you’ll need:

```
DD_API_KEY=<your_api_key>     # for the Agent container
DD_SITE=datadoghq.com
DD_SERVICE=datadog-nodejs-init-tracer
DD_ENV=dev
DD_VERSION=1.0.0
# Optional for RUM:
DD_APPLICATION_ID=
DD_CLIENT_TOKEN=
```

Then:

```bash
docker compose up --build
# open http://localhost:3000
```

## Observability expectations

- **APM:** You should see traces/spans for Express routes and custom work under the `DD_SERVICE` name. Errors appear when you call `/api/random?forceStatus=400`.
- **RUM:** If tokens are provided, page views/interactions (and session replay if supported) are sent to the `DD_SITE` you configured.
- **Logs (optional):** If you want logs correlated, run the Agent with logs enabled and consider `DD_LOGS_INJECTION=true` and a structured logger. (Not required for this sample.)

## Troubleshooting

- Set `DD_TRACE_DEBUG=true` to get tracer debug logs in stdout.
- Confirm the Agent is reachable from the container (`DD_AGENT_HOST`/`DD_TRACE_AGENT_PORT`).
- Verify `DD_SERVICE`, `DD_ENV`, `DD_VERSION`, and `DD_SITE` are set as expected at **runtime**.
