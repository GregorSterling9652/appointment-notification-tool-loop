import { z } from "zod";

export const appointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  state: z.enum(["confirmed", "cancelled", "pending"]),
  patientOptedIn: z.boolean(),
  channel: z.literal("email"),
  requestId: z.string().uuid()
}).strict();

export type Appointment = z.infer<typeof appointmentSchema>;

export function notificationDecision(input: Appointment) {
  if (!input.patientOptedIn || input.state === "pending") {
    return { action: "none" as const, reason: input.patientOptedIn ? "pending" : "no_consent" };
  }
  return {
    action: "queue" as const,
    notification: {
      id: input.requestId,
      appointmentId: input.appointmentId,
      channel: input.channel,
      template: input.state === "confirmed" ? "appointment_confirmed" as const : "appointment_cancelled" as const
    }
  };
}
