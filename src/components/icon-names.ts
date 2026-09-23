// Every Material Symbols icon the app renders. SOURCE OF TRUTH for the
// self-hosted icon-font subset (src/fonts/material-symbols-outlined.woff2).
//
// The font only contains the glyphs listed here. A name missing from this list
// renders as its literal ligature text ("mic", "send") — a visible bug — so
// Icon's `name` prop is typed IconName and a missing name fails type-checking.
//
// Adding an icon: add its name here (keep alphabetical), then run
//   npm run icons:build
// and commit both this file and the regenerated woff2.
export const ICON_NAMES = [
  'account_balance_wallet',
  'add',
  'add_to_home_screen',
  'all_inclusive',
  'arrow_back',
  'arrow_forward',
  'attach_file',
  'block',
  'build',
  'check',
  'check_circle',
  'chevron_right',
  'close',
  'content_copy',
  'delete',
  'delete_forever',
  'description',
  'download',
  'edit',
  'edit_square',
  'error',
  'error_outline',
  'expand_more',
  'folder',
  'graphic_eq',
  'help',
  'history',
  'hourglass_empty',
  'image',
  'install_mobile',
  'ios_share',
  'link',
  'link_off',
  'local_gas_station',
  'lock',
  'lock_open',
  'mic',
  'notifications',
  'open_in_new',
  'payments',
  'pending',
  'photo_camera',
  'photo_library',
  'preview',
  'receipt_long',
  'refresh',
  'request_quote',
  'send',
  'settings',
  'share',
  'shopping_cart',
  'sync',
  'sync_problem',
  'undo',
  'upload',
  'visibility',
  'visibility_off',
  'warning',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
