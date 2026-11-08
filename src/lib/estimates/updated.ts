// “Updated” on a client's estimate link is derived, never stored.
//
// A link says Updated only when the owner published a version after v1 AND that
// version was snapshotted after the client's most recent view. A v1 link never
// says it, and a link the client has never opened never says it.
//
// document_views only holds CLIENT views: log_document_view refuses the owner's
// own session (`p_viewer is null or p_viewer <> i.user_id`), so no owner row is
// ever written. `byOwner` stays here as defence in depth for callers and tests.

export type EstimateView = {
  /** ISO timestamp of the view. */
  viewedAt: string;
  /** True only if a caller ever supplies an owner view; the view log cannot. */
  byOwner?: boolean;
};

export function isUpdatedSinceView(input: {
  version: number | null | undefined;
  versionAt: string | null | undefined;
  views: EstimateView[];
}): boolean {
  const version = Number(input.version ?? 0);
  // v1 is the version that was sent; an edit is what makes a link carry news.
  if (!Number.isFinite(version) || version <= 1) return false;

  const publishedAt = input.versionAt ? Date.parse(input.versionAt) : NaN;
  if (!Number.isFinite(publishedAt)) return false;

  const clientViews = input.views
    .filter((v) => v.byOwner !== true)
    .map((v) => Date.parse(v.viewedAt))
    .filter((n) => Number.isFinite(n));
  // Never opened: there is no view for the new version to be newer than.
  if (clientViews.length === 0) return false;

  return publishedAt > Math.max(...clientViews);
}
