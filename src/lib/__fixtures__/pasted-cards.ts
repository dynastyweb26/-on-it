// Real work cards pasted into chat (founder-supplied, 2026-10-15). Regression
// fixtures for src/lib/pasted-notes.ts.

/** No prices: On It must ask for them, never invent any. */
export const CARD_1_NO_PRICES = `10/1 WIC not cooling and WIF freezer ice build up
After inspection we found the following:
WIC
1. Partially frozen evap ( Defrosted with hose)
WIF
1. Drain line insulation not installed properly (Repaired)
Mod -Fallon
Tech- AJ / Milo`;

/** Expected: exactly 2 line items, $80 + $39 = $119.00; no $56 or $27.30 anywhere. */
export const CARD_2_TORTILLA_WARMER = `10/5 ~ SC WO# 366060664 ~ tortilla warmer will not turn on
Upon inspection I found the following:
1. Damaged thermostat
2. Failed rocker switch
Notes: The thermostat and rocker switch are falling apart due to rust. The thermostat broke and shorted out in the unit and the rocker switch can move. The unit is from 2017 and rusting out.
Tech ~ Dean
MOD ~ Raul
Hatco thermostat
P# 02-16-039 ~ C$56 ~ L$80
Hatco rocker switch
P# 02-19-215 ~ C$27.30 ~ L$39`;
