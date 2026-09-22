import assert from "node:assert/strict";
import { test } from "node:test";
import { appointmentSchema, notificationDecision } from "../src/notification_policy.js";

const base = {
  appointmentId: "92d8f7ad-5e11-4ff2-8814-2b7022520d15",
  requestId: "0fd05578-7bd6-4e19-9f4f-f8632db4ace2",
  channel: "email" as const
};

test("only consented confirmed appointments yield a templated notification", () => {
  const eligible = notificationDecision(appointmentSchema.parse({ ...base, state: "confirmed", patientOptedIn: true }));
  assert.deepEqual(eligible, {
    action: "queue",
    notification: { id: base.requestId, appointmentId: base.appointmentId, channel: "email", template: "appointment_confirmed" }
  });
  assert.deepEqual(notificationDecision(appointmentSchema.parse({ ...base, state: "confirmed", patientOptedIn: false })),
    { action: "none", reason: "no_consent" });
  assert.deepEqual(notificationDecision(appointmentSchema.parse({ ...base, state: "pending", patientOptedIn: true })),
    { action: "none", reason: "pending" });
});

test("request rejects patient identifiers and unrecognized fields", () => {
  assert.equal(appointmentSchema.safeParse({ ...base, state: "confirmed", patientOptedIn: true, patientName: "Ada" }).success, false);
  assert.equal(appointmentSchema.safeParse({ ...base, state: "confirmed", patientOptedIn: true, channel: "sms" }).success, false);
});
