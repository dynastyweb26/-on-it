// ═══ Tool · edit_client (write) ═══
//
// Changing a client's name, phone or email is a direct clients.update on the
// Clients screen (ClientForm save). Same table, same columns, same rule that a
// rename onto another client's name is refused by the (user_id, name_key) unique
// index. prepare() finds the ONE client through resolveClient, so a spoken name
// resolves exactly as every read tool resolves it; execute() re-reads the row and
// refuses when it moved since the card was shown.
import { z } from 'zod';
import { defineWriteTool } from '../contract';
import { ConfirmBatchProps } from '@/lib/templates/props';
import { manySentence } from '../write-targets';
import { normName, resolveClient, type ClientRow } from '../read';

export const EDIT_CLIENT = 'edit_client';

export const EditClientInput = z
  .object({
    /** Who: the name the user said. resolveClient decides who that is. */
    client: z.string().min(1).max(120),
    name: z.string().min(1).max(120).optional(),
    /** An empty string clears the field, exactly as the form's clean() does. */
    phone: z.string().max(40).optional(),
    email: z.string().max(160).optional(),
  })
  .strict()
  .refine(
    (v) => v.name !== undefined || v.phone !== undefined || v.email !== undefined,
    { message: 'say what to change: name, phone or email' },
  );

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

const tidyName = (name: string): string => name.trim().replace(/\s+/g, ' ');
const orNull = (value: string): string | null => value.trim() || null;

/** Every live client of the caller: the rename check and the row lookup share it. */
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
    'Propose changing ONE saved client’s name, phone number or email address. The client is found by the name the user said; give only the fields that change, and an empty string clears a phone or email. It saves nothing: the app shows a card and the owner confirms. Refuses when several clients match that name, when the client has no saved row, or when the new name is already another client’s.',
  input: EditClientInput,
  output: EditClientOutput,
  type: 'write',
  risk: 'medium',
  defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
  prepare: async (ctx, args) => {
    const said = args.client.trim();
    const resolution = await resolveClient(ctx, said);
    if (resolution.kind === 'none') return { ok: false, problem: `No client named ${said}.` };
    if (resolution.kind === 'many') {
      return { ok: false, problem: manySentence(`More than one client matches "${said}"`, resolution.names) };
    }

    const row = (await liveClients(ctx)).find((c) => normName(c.name) === normName(resolution.name));
    if (!row) return { ok: false, problem: `There is no saved client named ${resolution.name} to change.` };

    const name = args.name !== undefined ? tidyName(args.name) : row.name;
    const phone = args.phone !== undefined ? orNull(args.phone) : (row.phone ?? null);
    const email = args.email !== undefined ? orNull(args.email) : (row.email ?? null);
    if (!name) return { ok: false, problem: 'A client needs a name.' };
    if (email && !EMAIL.test(email)) {
      return { ok: false, problem: `"${email}" does not look like an email address.` };
    }

    const changes: string[] = [];
    if (name !== row.name) changes.push(`name ${row.name} to ${name}`);
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
        name,
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

    // Re-read first: the row may have been renamed, edited or deleted since the
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

    if (r.name !== r.oldName) {
      const taken = (await liveClients(ctx)).some(
        (other) => other.id !== r.id && normName(other.name) === normName(r.name),
      );
      if (taken) return { ok: false, problem: `You already have a client named ${r.name}.` };
    }

    const { error: updateError } = await ctx.db.update(
      'clients',
      { name: r.name, phone: r.phone, email: r.email },
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
