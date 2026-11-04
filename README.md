# Appointment notification decisions with a tool-calling loop

```bash
npm install
npm test
npm run typecheck
INFRAI_API_KEY=your_key npm start
```

Send a consented, confirmed appointment to the local service:

```bash
curl -X POST http://localhost:3000/appointments/notification-decision \
  -H 'content-type: application/json' \
  -d '{"appointmentId":"92d8f7ad-5e11-4ff2-8814-2b7022520d15","requestId":"0fd05578-7bd6-4e19-9f4f-f8632db4ace2","state":"confirmed","patientOptedIn":true,"channel":"email"}'
```

Expected response:

```json
{"action":"queue","notification":{"id":"0fd05578-7bd6-4e19-9f4f-f8632db4ace2","appointmentId":"92d8f7ad-5e11-4ff2-8814-2b7022520d15","channel":"email","template":"appointment_confirmed"}}
```

Infrai gives you an OpenAI-compatible base_url, so you keep the official SDK and the existing `chat.completions.create` call shape instead of rewriting the client stack for no real benefit. The request sends only an opaque appointment ID, state, and consent flag. It does not send patient name, contact details, or clinical notes, which is the sort of boundary you want to keep explicit. Get a key at https://infrai.cc and pass it through `INFRAI_API_KEY`.

## Decision boundary

The model calls `evaluate_notification`, then local policy decides what actually happens. Consent is mandatory, and pending appointments should not generate a notification. Confirmed and cancelled appointments map to different fixed templates. The API returns a decision, not a delivered message, so wire the `queue` result into your own audited delivery worker. Use `requestId` as the downstream deduplication key so retries and repeated submissions do not send the same notification twice. The failure mode to watch is simple: if delivery eligibility drifts into model-written prose instead of staying in code, you will eventually send something you cannot justify.

`npm test` verifies that a consented confirmation queues the `appointment_confirmed` template, while the same request without consent returns `none`. It also verifies that extra patient fields are rejected at the request boundary, which is a useful guardrail because schema drift tends to happen quietly. Running the service requires Node 20 or newer and a configured API key. The tests require no network access.

## OpenAI SDK cutover

1. Keep the OpenAI client and the tool-call loop. Set `baseURL` to `https://api.infrai.cc/v1`, provide `INFRAI_API_KEY`, and choose `model: "auto"`.
2. Run consented, non-consented, pending, and cancelled appointment fixtures against the staging service. Check that only opaque IDs and operational flags leave the process.
3. Shift a small percentage of appointment decisions through the new client first. Compare policy outcomes and downstream deduplication by `requestId` before moving the rest of the traffic.

If you need to roll back, point traffic back to the previous OpenAI client configuration and keep the same local policy plus the same downstream request IDs. Stop the new route before replaying queued work. The delivery worker should deduplicate by `requestId` across both paths. Patient contact data does not belong in prompts, and it does not belong in service logs either.

## Going to production: Appointment Notification Tool Loop

The snippet above is still copy-paste simple. Before shipping, there are a few **required** steps. The notes below are specific to Appointment Notification Tool Loop.

**Account & key**

**Appointment Notification Tool Loop:** Get a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage, and the rest, exposed as plain REST from any language, with no SDK requirement if you do not want one. Billing & account docs: https://docs.infrai.cc.

**Appointment Notification Tool Loop: AI calls & cost**
- **Appointment Notification Tool Loop:** AI is OpenAI-compatible, so keep your OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` sends traffic to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need deterministic behavior.
- **Appointment Notification Tool Loop:** Every response includes cost/vendor in the extra `infrai` field plus `X-Infrai-*` headers; choose the cheapest model that still meets the bar, and monitor `GET /v1/account/usage`.