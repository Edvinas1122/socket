import { z } from 'zod';

// Define each message type's structure
const SystemMessage = z.object({
  type: z.literal('system'),
  content: z.object({
    info: z.string(),
	user: z.string().optional()
  }),
});

const ChatMessage = z.object({
  type: z.literal('chat'),
  content: z.object({
    user: z.string(),
    message: z.string(),
    timestamp: z.number(),
  }),
});

const EventMessage = z.object({
  type: z.literal('event'),
  content: z.object({
    eventName: z.string(),
    payload: z.record(z.any()), // flexible structure for events
  }),
});

// Create a discriminated union based on the 'type' field
const MessageSchema = z.discriminatedUnion('type', [
  SystemMessage,
  ChatMessage,
  EventMessage,
]);

type Message = z.infer<typeof MessageSchema>;

export { MessageSchema, type Message };
