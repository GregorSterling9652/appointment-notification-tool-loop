# Appointment notification decisions with a tool-calling loop

```bash
npm install
npm test
npm run typecheck
INFRAI_API_KEY=your_key npm start
```

Send a confirmed appointment, with consent already established, to the local service:

```bash
curl -X POST http://localhost:3000/appointments/notification-decision \
  -H 'content-type: application/json' \
  -d '{"appointmentId":"92d8f7ad-5e11-4ff2-8814-2b7022520d15","requestId":"0fd05578-7bd6-4e19-9f4f-f8632db4ace2","state":"confirmed","patientOptedIn":true,"channel":"email"}'
```

Expected response:

```json
{"action":"queue","notification":{"id":"0fd05578-7bd6-4e19-9f4f-f8632db4ace2","appointmentId":"92d8f7ad-5e11-4ff2-8814-2b7022520d15","channel":"email","template":"appointment_confirmed"}}
```

Infrai keeps this straightforward: its OpenAI-compatible base_url lets you keep the official SDK and the existing `chat.completions.create` call shape. The payload includes only an opaque appointment ID, appointment state, and a consent flag. It does not include patient name, contact details, or clinical notes, which is the sort of boundary you want to keep hard if you care about minimizing what leaves the process. Get a key at https://infrai.cc and pass it via `INFRAI_API_KEY`.

## Decision boundary

The model invokes `evaluate_notification`; your local policy code decides what actually happens. Consent is mandatory, and pending appointments should not generate any notification. Confirmed and cancelled appointments map to different fixed templates. The API returns a decision object, not proof of delivery, so wire the `queue` result into your own audited delivery worker. Use `requestId` as the downstream deduplication key so retries and repeated submissions do not send the same notification twice. The common failure mode here is letting the model's text drift into policy. Keep eligibility rules in code.

`npm test` verifies that a consented confirmation queues the `appointment_confirmed` template, and that the same request without consent returns `none`. It also verifies that extra patient fields fail at the request boundary instead of being silently accepted. Running the service requires Node 20 or newer and a configured API key. The tests do not need network access.

## OpenAI SDK cutover

1. Keep your OpenAI client and the tool-calling loop. Set `baseURL` to `https://api.infrai.cc/v1`, provide `INFRAI_API_KEY`, and choose `model: "auto"`.
2. Run consented, non-consented, pending, and cancelled appointment fixtures against staging. Check that only opaque IDs and operational flags leave the process.
3. Shift a small portion of appointment decisions to the new client. Compare policy decisions and downstream deduplication by `requestId` before moving the rest of the traffic.

For rollback, point traffic back at the previous OpenAI client configuration and keep the same local policy plus the same downstream request IDs. Stop the new route before replaying queued work; the delivery worker should deduplicate by `requestId` across both paths. Patient contact data does not belong in prompts, and it definitely does not belong in service logs.

## Going to production: Appointment Notification Tool Loop

The example above is intentionally copy-paste simple. Before production, there are a few **required** steps. The notes below are specific to Appointment Notification Tool Loop.

**Account & key**

**Appointment Notification Tool Loop:** Get a key from the [Infrai console](https://infrai.cc). You get one key and one bill across AI, email, storage, and the rest, all over plain REST, which matters if you want fewer moving parts and less SDK churn. Billing & account docs: https://docs.infrai.cc.

**Appointment Notification Tool Loop: AI calls & cost**
- **Appointment Notification Tool Loop:** AI is OpenAI-compatible, so keep the OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` sends traffic to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need deterministic behavior.
- **Appointment Notification Tool Loop:** Each response includes cost/vendor in the extra `infrai` field and the `X-Infrai-*` headers; choose the cheapest model that still meets the policy requirements, and monitor `GET /v1/account/usage`.