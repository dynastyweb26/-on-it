// Render-input snapshot written onto an invoice row at finalize (first send), so
// a finalized invoice always renders exactly as it was sent. Later Settings
// changes to the template, brand colors, business identity, or payment handles
// must NOT retroactively rewrite past invoices — same rationale as the client
// contact snapshot (migration 20260812120000). Keys map 1:1 to the invoice
// snapshot columns added in 20260904120000_invoice_render_snapshot.
//
// Deliberately NOT snapshotted:
//   • zelle — kept encrypted in one place (profiles.zelle_info_enc) and read live
//     at render. Copying it onto every invoice would spread the secret. This is
//     accepted drift: if a user changes their Zelle, past invoices show the new
//     value. (The other handles ARE snapshotted here.)
//   • the logo ASSET — we store logo_url only. If the file is later replaced or
//     removed the stored URL can 404 on an old invoice. Truly freezing the asset
//     (copying the file at finalize) is correct but out of scope. Known limitation.

export interface RenderSnapshotSource {
  invoice_template?: string | null;
  brand_colors?: string[] | null;
  background_color?: string | null;
  business_name?: string | null;
  logo_url?: string | null;
  website_url?: string | null;
  slogan?: string | null;
  cashapp_tag?: string | null;
  paypal_me?: string | null;
  venmo_username?: string | null;
}

/** The snapshot object to merge into the invoices UPDATE at finalize. */
export function renderSnapshot(p: RenderSnapshotSource) {
  return {
    template: p.invoice_template ?? null,
    brand_colors: p.brand_colors ?? null,
    background_color: p.background_color ?? null,
    business_name: p.business_name ?? null,
    logo_url: p.logo_url ?? null,
    website_url: p.website_url ?? null,
    slogan: p.slogan ?? null,
    cashapp_tag: p.cashapp_tag ?? null,
    paypal_me: p.paypal_me ?? null,
    venmo_username: p.venmo_username ?? null,
  };
}
