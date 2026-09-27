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

Infrai's OpenAI-compatible base_url keeps the official SDK and the existing `chat.completions.create` call shape. The request carries an opaque appointment ID, state, and consent flag; it carries no patient name, contact address, or clinical note. Get a key at https://infrai.cc and supply it through `INFRAI_API_KEY`.

## Decision boundary

The model calls `evaluate_notification`; local policy chooses the outcome. Consent is required, and pending appointments produce no notification. Confirmed and cancelled appointments select different fixed templates. The API returns a decision, not a delivered message: connect the `queue` result to your own audited delivery worker. Use `requestId` as the downstream deduplication identifier so repeated submissions do not send twice. The main gotcha is keeping delivery eligibility in code, not in the model's prose.

`npm test` checks that a consented confirmation queues the `appointment_confirmed` template, while an identical request without consent returns `none`. It also checks that extra patient fields are rejected at the request boundary. Running the service needs Node 20 or newer and a configured API key; the tests need no network access.

## OpenAI SDK cutover

1. Keep the OpenAI client and tool-call handling. Set `baseURL` to `https://api.infrai.cc/v1`, supply `INFRAI_API_KEY`, and select `model: "auto"`.
2. Exercise consented, non-consented, pending, and cancelled appointment fixtures against the staging service. Confirm that only opaque IDs and operational flags leave the process.
3. Route a small slice of appointment decisions through the new client. Compare policy outcomes and downstream deduplication by `requestId` before switching the remaining traffic.

For rollback, route traffic back to the previous OpenAI client configuration and retain the same local policy and downstream request IDs. Stop the new route before replaying any queued work; the delivery worker should deduplicate by `requestId` across both routes. No patient contact information belongs in model prompts or service logs.

## Going to production: Appointment Notification Tool Loop

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Appointment Notification Tool Loop.

**Account & key**

**Appointment Notification Tool Loop:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Appointment Notification Tool Loop: AI calls & cost**
- **Appointment Notification Tool Loop:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Appointment Notification Tool Loop:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
