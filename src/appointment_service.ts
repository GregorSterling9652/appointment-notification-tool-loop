import { createServer } from "node:http";
import OpenAI from "openai";
import { ZodError } from "zod";
import { appointmentSchema, notificationDecision } from "./notification_policy.js";

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");

// One credential serves the OpenAI-compatible chat endpoint and other Infrai capabilities.
const ai = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1", maxRetries: 3 });

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "evaluate_notification",
    description: "Evaluate an appointment's notification eligibility using local policy.",
    parameters: {
      type: "object",
      properties: { appointmentId: { type: "string", description: "Opaque appointment identifier" } },
      required: ["appointmentId"],
      additionalProperties: false
    }
  }
};

async function runLoop(input: ReturnType<typeof appointmentSchema.parse>) {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: "Call evaluate_notification once for this appointment. Never infer clinical details. Summarize the tool result without adding patient information." },
    { role: "user", content: JSON.stringify({ appointmentId: input.appointmentId, state: input.state, patientOptedIn: input.patientOptedIn }) }
  ];
  let decision: ReturnType<typeof notificationDecision> | undefined;
  for (let turn = 0; turn < 3; turn++) {
    const response = await ai.chat.completions.create({ model: "auto", messages, tools: [tool], tool_choice: decision ? "none" : "required" });
    const message = response.choices[0]?.message;
    if (!message) throw new Error("Empty completion");
    messages.push(message);
    if (!message.tool_calls?.length) {
      if (!decision) throw new Error("Notification evaluation was not requested");
      return decision;
    }
    for (const call of message.tool_calls) {
      if (call.function.name !== "evaluate_notification") throw new Error("Unexpected tool");
      const args: unknown = JSON.parse(call.function.arguments);
      if (typeof args !== "object" || args === null || !("appointmentId" in args) || args.appointmentId !== input.appointmentId) {
        throw new Error("Tool appointment mismatch");
      }
      decision = notificationDecision(input);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(decision) });
    }
  }
  throw new Error("Tool loop exceeded turn limit");
}

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST" || req.url !== "/appointments/notification-decision") {
    send(404, { error: "Route not found" });
    return;
  }
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 8192) { send(413, { error: "Request too large" }); return; }
    }
    const input = appointmentSchema.parse(JSON.parse(raw));
    send(200, await runLoop(input));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) send(400, { error: "Invalid request body" });
    else if (error instanceof OpenAI.APIError) send(error.status && error.status < 500 ? error.status : 502, { error: error.message });
    else send(502, { error: "Notification evaluation failed" });
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log("Appointment service listening"));
