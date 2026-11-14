// ═══ Tool · edit_client (write) ═══
//
// Phone and email only. A rename is NOT offered here: invoices store the billed
// party as text (invoices.client_name), so renaming the clients row would leave
// every past invoice under the old name — the client would split in two. The
// Clients screen owns the rename; this tool says so and stops.
//
// Otherwise it is the same direct clients.update the Clients screen makes, under
// the caller's own session; prepare() finds the ONE client through resolveClient,
// so a spoken name resolves exactly as every read tool resolves it, and
// execute() re-reads the row and refuses when it moved since the card was shown.
import { z } from 'zod';
import { defineWriteTool } from '../contract';
import { ConfirmBatchProps } from '@/lib/templates/props';
import { manySentence } from '../write-targets';
import { normName, resolveClient, type ClientRow } from '../read';

export const EDIT_CLIENT = 'edit_client';

/** The one sentence a rename gets, because a rename here would split a client. */
export const RENAME_ELSEWHERE =
  "I can change a client's phone or email here. To rename a client, open them in Clients.";

export const EditClientInput = z
  .object({
    /** Who: the name the user said. resolveClient decides who that is. */
    client: z.string().min(1).max(120),
    /** Accepted only to refuse it with RENAME_ELSEWHERE; never written. */
    name: z.string().min(1).max(120).optional(),
    /** An empty string clears the field, exactly as the form's clean() does. */
    phone: z.string().max(40).optional(),
    email: z.string().max(160).optional(),
  })
  .strict()
  .refine((v) => v.phone !== undefined || v.email !== undefined || v.name !== undefined, {
    message: 'say what to change: phone or email',
  });

export const EditClientOutput = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

type Resolved = {
  id: string;
  oldName: string;
  oldPhone: string | null;
  oldEmail: string | null;
  name: string;
  phone: string | null;
  email: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The read row plus the soft-delete flag this tool checks before writing. */
type ClientFull = ClientRow & { deleted_at?: string | null };

const orNull = (value: string): string | null => value.trim() || null;

/** Every live client of the caller: the row lookup reads the same rows. */
async function liveClients(ctx: { db: Parameters<typeof resolveClient>[0]['db']; userId: string }) {
  const { data, error } = await ctx.db.select<ClientFull>('clients', {
    columns: '*',
    eq: { user_id: ctx.userId },
    is: { deleted_at: null },
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const editClientTool = defineWriteTool({
  name: EDIT_CLIENT,
  description:
    'Propose changing ONE saved client’s phone number or email address. The client is found by the name the user said; give only the fields that change, and an empty string clears a phone or email. It cannot rename a client: a rename belongs on the Clients screen. It saves nothing: the app shows a card and the owner confirms. Refuses when several clients match that name, or when the client has no saved row.',
  input: EditClientInput,
  output: EditClientOutput,
  type: 'write',
  risk: 'medium',
  defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
  prepare: async (ctx, args) => {
    // A rename would break the link to every past invoice, which keeps its own
    // client_name text. Say where a rename lives, and propose nothing.
    if (args.name !== undefined) return { ok: false, problem: RENAME_ELSEWHERE };

    const said = args.client.trim();
    const resolution = await resolveClient(ctx, said);
    if (resolution.kind === 'none') return { ok: false, problem: `No client named ${said}.` };
    if (resolution.kind === 'many') {
      return { ok: false, problem: manySentence(`More than one client matches "${said}"`, resolution.names) };
    }

    const row = (await liveClients(ctx)).find((c) => normName(c.name) === normName(resolution.name));
    if (!row) return { ok: false, problem: `There is no saved client named ${resolution.name} to change.` };

    const phone = args.phone !== undefined ? orNull(args.phone) : (row.phone ?? null);
    const email = args.email !== undefined ? orNull(args.email) : (row.email ?? null);
    if (email && !EMAIL.test(email)) {
      return { ok: false, problem: `"${email}" does not look like an email address.` };
    }

    const changes: string[] = [];
    if (phone !== (row.phone ?? null)) changes.push(`phone ${row.phone ?? 'none'} to ${phone ?? 'none'}`);
    if (email !== (row.email ?? null)) changes.push(`email ${row.email ?? 'none'} to ${email ?? 'none'}`);
    if (changes.length === 0) return { ok: false, problem: `Nothing to change on ${row.name}.` };

    return {
      ok: true,
      resolved: {
        id: row.id,
        oldName: row.name,
        oldPhone: row.phone ?? null,
        oldEmail: row.email ?? null,
        name: row.name,
        phone,
        email,
      } satisfies Resolved,
      row: {
        icon: 'person',
        summary: `Change client ${row.name}: ${changes.join(' · ')}`,
        amount: '',
        tone: 'neutral',
      },
    };
  },
  execute: async (ctx, resolved) => {
    const r = resolved as Resolved;

    // Re-read first: the row may have been edited, renamed or deleted since the
    // card was drawn, and a write based on a stale read is the one to refuse.
    const { data, error } = await ctx.db.select<ClientFull>('clients', {
      columns: '*',
      eq: { user_id: ctx.userId, id: r.id },
      limit: 1,
    });
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (!row || row.deleted_at) return { ok: false, problem: 'That client is gone now.' };
    if (
      row.name !== r.oldName
      || (row.phone ?? null) !== r.oldPhone
      || (row.email ?? null) !== r.oldEmail
    ) {
      return { ok: false, problem: `${r.oldName} changed since I looked. Ask me again.` };
    }

    // Phone and email only: the name column is never written by this tool.
    const { error: updateError } = await ctx.db.update(
      'clients',
      { phone: r.phone, email: r.email },
      { eq: { id: r.id } },
    );
    if (updateError) throw new Error(updateError.message);

    return { ok: true, result: { id: r.id, name: r.name } };
  },
  fallback: (result) => `Changed ${result.name}.`,
  fixture: {
    args: { client: 'Maria Santos', phone: '555-0199' },
    result: { id: 'cli-1', name: 'Maria Santos' },
  },
  preview: {
    resolved: {
      id: 'owner-client', oldName: 'Maria Santos', oldPhone: null, oldEmail: 'maria@example.com',
      name: 'Maria Santos', phone: '555-0199', email: 'maria@example.com',
    },
    row: {
      icon: 'person',
      summary: 'Change client Maria Santos: phone none to 555-0199',
      amount: '',
      tone: 'neutral',
    },
  },
});
