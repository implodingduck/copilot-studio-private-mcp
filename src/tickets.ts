import { z } from "zod";

export const statusSchema = z.enum(["open", "inprogress", "closed"]);
export const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const ticketIdSchema = z.string().regex(/^TKT-\d{4,}$/);
const text = (max: number) => z.string().trim().min(1).max(max);

export const createTicketSchema = z.object({
  title: text(160),
  description: text(4000),
  requester: text(160).describe(
    "Mock requester name; use fictional data only.",
  ),
  priority: prioritySchema.default("normal"),
});
export const updateTicketSchema = z.object({
  ticket_id: ticketIdSchema,
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  assignee: text(160).optional(),
});
export const addCommentSchema = z.object({
  ticket_id: ticketIdSchema,
  author: text(160),
  text: text(4000),
});

export interface Ticket {
  id: string;
  title: string;
  description: string;
  requester: string;
  priority: z.infer<typeof prioritySchema>;
  status: z.infer<typeof statusSchema>;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  comments: { author: string; text: string; created_at: string }[];
}

export class TicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Ticket ${id} was not found.`);
  }
}

export class TicketStore {
  private readonly tickets = new Map<string, Ticket>();
  private sequence = 1003;

  constructor() {
    const seeds = [
      [
        "VPN connection fails",
        "VPN disconnects after sign-in.",
        "Avery Demo",
        "high",
        "open",
      ],
      [
        "Laptop replacement",
        "Prepare a replacement demo laptop.",
        "Morgan Example",
        "normal",
        "inprogress",
      ],
      [
        "Password reset",
        "Reset completed for a fictional demo account.",
        "Riley Sample",
        "low",
        "closed",
      ],
    ] as const;
    for (const [
      index,
      [title, description, requester, priority, status],
    ] of seeds.entries()) {
      const created_at = "2026-01-15T10:00:00.000Z";
      const id = `TKT-${1001 + index}`;
      this.tickets.set(id, {
        id,
        title,
        description,
        requester,
        priority,
        status,
        assignee: status === "open" ? null : "Support Demo",
        created_at,
        updated_at: created_at,
        comments: [
          { author: "Support Demo", text: "Seeded demo ticket.", created_at },
        ],
      });
    }
  }

  list(status?: Ticket["status"]): Ticket[] {
    return structuredClone(
      [...this.tickets.values()].filter(
        (ticket) => !status || ticket.status === status,
      ),
    );
  }

  get(id: string): Ticket {
    const ticket = this.tickets.get(id);
    if (!ticket) throw new TicketNotFoundError(id);
    return structuredClone(ticket);
  }

  create(input: z.infer<typeof createTicketSchema>): Ticket {
    const now = new Date().toISOString();
    const ticket: Ticket = {
      ...input,
      id: `TKT-${++this.sequence}`,
      status: "open",
      assignee: null,
      created_at: now,
      updated_at: now,
      comments: [],
    };
    this.tickets.set(ticket.id, ticket);
    return structuredClone(ticket);
  }

  update({
    ticket_id,
    ...changes
  }: z.infer<typeof updateTicketSchema>): Ticket {
    const ticket = this.get(ticket_id);
    Object.assign(ticket, changes, { updated_at: new Date().toISOString() });
    this.tickets.set(ticket_id, ticket);
    return structuredClone(ticket);
  }

  addComment({
    ticket_id,
    author,
    text,
  }: z.infer<typeof addCommentSchema>): Ticket {
    const ticket = this.get(ticket_id);
    const now = new Date().toISOString();
    ticket.comments.push({ author, text, created_at: now });
    ticket.updated_at = now;
    this.tickets.set(ticket_id, ticket);
    return structuredClone(ticket);
  }
}
