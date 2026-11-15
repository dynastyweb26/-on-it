// ═══ Tool · create_client (write, pilot) ═══
//
// The model can propose a client; it can never create one. prepare() is a
// read-only check that answers the card row or a sentence the user can act on;
// execute() runs only from /api/ai/confirm, re-checks that the name is still
// free, and then saves through the same save_client RPC the Clients screen uses
// (so the row, its name_key and the invoice linking are identical).
//
// A proposal stores the exact, normalised name and contacts — never the model's
// raw arguments — so a confirm can only write what prepare validated.
import { z } from 'zod';
import { defineWriteTool } from '../contract';
import { ConfirmBatchProps } from '@/lib/templates/props';
import { clientNames, normName } from '../read';

export const CREATE_CLIENT = 'create_client';

export const CreateClientInput = z
  .object({
    name: z.string().min(1).max(120),
    phone: z.string().max(40).optional(),
    email: z.string().max(160).optional(),
  })
  .strict();

export const CreateClientOutput = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Past documents the RPC linked to this client by name. */
  linked: z.number().int().nonnegative(),
});

type Resolved = { name: string; phone: string; email: string };

/** One spelling: btrim, and runs of spaces become one. */
function tidyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The exact client of that name, if the owner already has one. */
async function existingClient(
  ctx: { db: Parameters<typeof clientNames>[0]['db']; userId: string },
  name: string,
): Promise<string | null> {
  const key = normName(name);
  const found = (await clientNames(ctx)).find((candidate) => normName(candidate) === key);
  return found ?? null;
}

export const createClientTool = defineWriteTool({
  name: CREATE_CLIENT,
  description:
    'Propose adding ONE client to the client list, with a name and optionally a phone number and email address. It does not save anything: the app shows a card and the owner confirms. Refuses when a client with that exact name already exists, saying so. This is only for a new client; looking one up is find_client.',
  input: CreateClientInput,
  output: CreateClientOutput,
  type: 'write',
  risk: 'medium',
  defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
  prepare: async (ctx, args) => {
    const name = tidyName(args.name);
    if (!name) return { ok: false, problem: 'A client needs a name.' };

    const email = args.email?.trim() ?? '';
    if (email && !EMAIL.test(email)) {
      return { ok: false, problem: `"${email}" does not look like an email address.` };
    }
    const phone = args.phone?.trim() ?? '';

    const already = await existingClient(ctx, name);
    if (already) {
      return { ok: false, problem: `You already have a client named ${already}.` };
    }

    return {
      ok: true,
      // The model's words are gone: a confirm can only write this.
      resolved: { name, phone, email } satisfies Resolved,
      row: {
        icon: 'person',
        summary: `Add client ${name}`,
        // The card shows the whole save, not just the name: the contacts the
        // owner gave, composed here so the model never writes them.
        detail: [phone, email].filter(Boolean).join(' · ') || undefined,
        amount: '',
        tone: 'neutral',
      },
    };
  },
  execute: async (ctx, resolved) => {
    const { name, phone, email } = resolved as Resolved;

    // Re-validate before writing: the name may have been saved in another tab.
    const now = await existingClient(ctx, name);
    if (now) return { ok: false, problem: `A client named ${now} already exists.` };

    const { data, error } = await ctx.db.rpc<Array<{ id: string; linked: number }>>('save_client', {
      p_name: name,
      p_phone: phone || null,
      p_email: email || null,
    });
    if (error) throw new Error(error.message);

    // save_client returns a table; a driver may hand back one row instead.
    const row = Array.isArray(data) ? data[0] : (data as { id: string; linked: number } | null);
    if (!row?.id) throw new Error('save_client returned no client id');

    return { ok: true, result: { id: row.id, name, linked: Number(row.linked ?? 0) } };
  },
  fallback: (result) => `Saved ${result.name} as a client.`,
  fixture: {
    // A name nobody on file has, so the shared safety suite can prepare this
    // proposal against the seeded rows without hitting an existing client.
    args: { name: 'Dwayne Carter', phone: '555-0123', email: 'dwayne@example.com' },
    result: { id: 'cli-2', name: 'Dwayne Carter', linked: 0 },
  },
  preview: {
    resolved: { name: 'Maria Santos', phone: '555-0100', email: 'maria@example.com' },
    row: {
      icon: 'person',
      summary: 'Add client Maria Santos',
      detail: '555-0100 · maria@example.com',
      amount: '',
      tone: 'neutral',
    },
  },
});
