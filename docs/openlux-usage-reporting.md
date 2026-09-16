# OpenLux usage reporting

Deploy the main application's `/api/sso/usage` endpoint with pending-status support first. Configure its `SSO_USAGE_SECRETS` entry `maijiaxiu` to match this tool's own `USAGE_MONITOR_INTERNAL_SECRET`.

Server variables:

```dotenv
MAIN_APP_URL=https://your-main-app.example
USAGE_MONITOR_INTERNAL_SECRET=the-maijiaxiu-specific-secret
USAGE_MONITOR_OUTBOX_DIR=/persistent-data/maijiaxiu-usage
```

Mount the outbox directory on persistent storage, shared by app instances if running multiple instances. Keep it outside public/static paths. The default is `data/usage-outbox` under the application working directory. Ephemeral serverless storage cannot provide durable delivery across deployments. Credentials are read from environment only and are never written into outbox events.

Only actual configured upstream hostname `api.openlux.ai` is reported, using fixed tool key `maijiaxiu`. Existing provider URLs, models, retry counts, fallbacks and business generation are unchanged. Yunwu, XAI and Shanbaob calls remain excluded unless their configured actual URL is OpenLux. Local development users and older queued jobs without a verified SSO snapshot are excluded.

Each fetch, HTTP/1.1 fallback and subsequent model retry has its own UUID. The server captures the live-validated SSO owner at the route or persisted job boundary; request bodies cannot choose the reporting user. Pending metadata is persisted before sending the model request. Terminal metadata contains only user/model/request/status/Token counts, including image input details if supplied. Missing usage remains null, including per-call image models; pricing is determined by the main app.

The outbox drains after model calls. Delivery failures retain immutable pending/terminal events, and retries reuse their UUID. A batch attempts up to 10 events with a 2-second reporting timeout each, stopping on the first delivery failure. To retry after an idle period, run from the repo root using Node 22.13+:

```sh
npm run usage:retry
```

Run the command repeatedly until no events remain, or schedule it in the deployment's existing scheduler. There is no new in-process background worker. A process killed during an upstream request can leave pending metadata; it is never automatically changed to completed. The current provider integrations consume synchronous results/SSE and do not poll newly accepted upstream async tasks. HTTP 202 responses remain pending for reconciliation. Storage failures emit a metadata-only error and preserve generation behavior; operators must correct inaccessible/full storage.

Validation uses mocked upstreams and no paid calls: `npm test`, `npm run build`. No legacy `/api/sso/billing` path exists in this repo.
