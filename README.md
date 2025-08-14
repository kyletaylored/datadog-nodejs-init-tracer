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
- `DD_GIT_REPOSITORY_URL`, `DD_GIT_COMMIT_SHA` — **Git build metadata** baked or passed to the container for Datadog source code correlation.

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

## Git build metadata (DD_GIT_REPOSITORY_URL, DD_GIT_COMMIT_SHA)

This image can bake the repository URL and commit SHA so Datadog can associate traces with source code.

**Dockerfile fragment:**

```dockerfile
ARG DD_GIT_REPOSITORY_URL
ARG DD_GIT_COMMIT_SHA
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}
# (optional) OCI labels for provenance
LABEL org.opencontainers.image.source=${DD_GIT_REPOSITORY_URL}
LABEL org.opencontainers.image.revision=${DD_GIT_COMMIT_SHA}
```

### Local build (docker)

```bash
# Normalize repo URL to https if the remote is ssh
REPO_URL="$(git config --get remote.origin.url | sed -E 's#^git@github.com:#https://github.com/#; s#\.git$##')"

docker build -t datadog-nodejs-init-tracer:local \
  --build-arg DD_GIT_REPOSITORY_URL="$REPO_URL" \
  --build-arg DD_GIT_COMMIT_SHA="$(git rev-parse HEAD)" \
  .
```

### Local build (docker-compose)

Add build args and provide values via shell exports or `.env`:

```yaml
services:
  app:
    build:
      context: .
      args:
        DD_GIT_REPOSITORY_URL: ${DD_GIT_REPOSITORY_URL}
        DD_GIT_COMMIT_SHA: ${DD_GIT_COMMIT_SHA}
```

```bash
export DD_GIT_REPOSITORY_URL="$(git config --get remote.origin.url | sed -E 's#^git@github.com:#https://github.com/#; s#\.git$##')"
export DD_GIT_COMMIT_SHA="$(git rev-parse HEAD)"

docker compose up --build
```

## CI/CD: GitHub Actions → GHCR

A workflow builds and publishes the container image to **GitHub Container Registry (GHCR)**.

**Workflow file:** `.github/workflows/publish.yml`

**Triggers:**

- Push to `main`/`master` → multi-arch images (`linux/amd64`, `linux/arm64`)
- Push tags matching `v*` (e.g., `v1.2.3`) → versioned image
- Pull Requests → build only (no push)

**Image name:** `ghcr.io/<OWNER>/<REPO>`
(Replace with your repo’s `owner/name`, e.g., `acme/datadog-nodejs-init-tracer`.)

**Tags produced:**

- `latest` on the default branch
- Branch tag (e.g., `main`)
- `sha-<shortsha>` on every build
- The git tag on tag builds (e.g., `v1.2.3`)

**Version value inside the image:**
The workflow sets `DD_VERSION` to the git tag (e.g. `0.0.2` from `v0.0.2`, trimming the leading `v`) or the short SHA for branch builds.

### Build args passed in CI

Add these to your `docker/build-push-action` step:

```yaml
with:
  build-args: |
    DD_SERVICE=datadog-nodejs-init-tracer
    DD_ENV=local
    DD_VERSION=${{ steps.version.outputs.val }}
    DD_SITE=datadoghq.com
    DD_GIT_REPOSITORY_URL=${{ github.server_url }}/${{ github.repository }}
    DD_GIT_COMMIT_SHA=${{ github.sha }}
```

### Pull the image directly

If the package is **public**:

```bash
docker pull ghcr.io/<OWNER>/<REPO>:latest
```

If **private**, authenticate first (create a PAT with `read:packages`):

```bash
export CR_PAT=ghp_************************
echo $CR_PAT | docker login ghcr.io -u <YOUR_GH_USERNAME> --password-stdin
docker pull ghcr.io/<OWNER>/<REPO>:latest
```

### Run the GHCR image

```bash
docker run --rm -p 3000:3000 \
  -e DD_SERVICE=datadog-nodejs-init-tracer \
  -e DD_ENV=dev \
  -e DD_VERSION=1.0.0 \
  -e DD_SITE=datadoghq.com \
  # Optional RUM
  # -e DD_APPLICATION_ID=your_app_id \
  # -e DD_CLIENT_TOKEN=your_client_token \
  # Optional APM if using a local Agent
  # -e DD_AGENT_HOST=host.docker.internal -e DD_TRACE_AGENT_PORT=8126 \
  ghcr.io/<OWNER>/<REPO>:latest
```

### Use the published image in docker-compose

Replace the `build:` section with an `image:` reference:

```yaml
services:
  app:
    image: ghcr.io/<OWNER>/<REPO>:latest
    container_name: datadog-nodejs-init-tracer
    environment:
      - PORT=3000
      - DD_SERVICE=${DD_SERVICE}
      - DD_ENV=${DD_ENV}
      - DD_VERSION=${DD_VERSION}
      - DD_SITE=${DD_SITE}
      - DD_APPLICATION_ID=${DD_APPLICATION_ID}
      - DD_CLIENT_TOKEN=${DD_CLIENT_TOKEN}
      - DD_AGENT_HOST=datadog-agent
      - DD_TRACE_AGENT_PORT=8126
    depends_on:
      - datadog-agent
    ports:
      - "3000:3000"
```

> You can still override `DD_VERSION`, `DD_GIT_REPOSITORY_URL`, and `DD_GIT_COMMIT_SHA` at **runtime** via env if desired.

## Observability expectations

- **APM:** You should see traces/spans for Express routes and custom work under the `DD_SERVICE` name. Errors appear when you call `/api/random?forceStatus=400`.
- **RUM:** If tokens are provided, page views/interactions (and session replay if supported) are sent to the `DD_SITE` you configured.
- **Logs (optional):** If you want logs correlated, run the Agent with logs enabled and consider `DD_LOGS_INJECTION=true` and a structured logger. (Not required for this sample.)

## Troubleshooting

- Set `DD_TRACE_DEBUG=true` to get tracer debug logs in stdout.
- Confirm the Agent is reachable from the container (`DD_AGENT_HOST`/`DD_TRACE_AGENT_PORT`).
- Verify `DD_SERVICE`, `DD_ENV`, `DD_VERSION`, and `DD_SITE` are set as expected at **runtime**.
