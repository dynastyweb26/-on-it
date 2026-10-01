// TEMPORARY — remove before merge. Deterministic mock rows for /dev/pdf-samples,
// in the exact shapes the database source returns, so the builder, templates
// and pagination run unchanged. Seeded PRNG: every build is the same document.
import type { Row, SummaryPdfSource } from '@/lib/pdf/build-summary';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/expenses';

export const MOCK_RANGE = { start: '2026-10-01', end: '2026-10-31' };
export const MOCK_PERIOD_LABEL = 'October 2026';

// mulberry32
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20261001);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const cents = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const at = (month: number, day: number, hour: number) => new Date(2026, month - 1, day, hour, int(0, 59)).toISOString();

// ── Income ────────────────────────────────────────────────────────────
const CLIENTS = [
  'Henderson Family', 'Garcia Remodeling', 'Oak Hollow HOA', 'Patel Residence', 'Marcus Johnson',
  'Lakeside Dental Group', 'The Nguyen Family', 'Riverbend Apartments', 'Sarah & Tom Whitaker',
  'Brightview Property Management', 'Carlos Mendoza', 'First Baptist Church of Mesquite', 'Kim Okafor',
  'Dallas Pet Resort', 'Linda Castillo', 'Two Brothers Taqueria', 'Westbrook Townhomes', 'Dr. Alan Pierce',
  'Greenfield Elementary PTA', 'Jasmine Reed', 'Cedar Ridge Storage', 'Robert & Ana Delgado',
  'Summit Fitness', 'Mike Thibodeaux', 'Prairie View Veterinary Clinic',
];

const WORK: { d: string; lo: number; hi: number; qty?: [number, number] }[] = [
  { d: 'Replace 50 gal water heater, haul away old unit', lo: 1450, hi: 2100 },
  { d: 'Labor — rough-in plumbing, master bath', lo: 85, hi: 125, qty: [6, 16] },
  { d: 'Install new kitchen faucet (customer supplied)', lo: 145, hi: 220 },
  { d: 'Snake main line from cleanout, camera inspection', lo: 275, hi: 450 },
  { d: 'Drywall patch and texture match', lo: 65, hi: 140, qty: [1, 6] },
  { d: 'Interior paint, two coats, walls only', lo: 2.1, hi: 3.4, qty: [180, 650] },
  { d: 'Replace GFCI outlet', lo: 85, hi: 135, qty: [1, 4] },
  { d: 'Ceiling fan install with new brace box', lo: 175, hi: 260 },
  { d: 'Pressure wash driveway and walkway', lo: 0.18, hi: 0.3, qty: [400, 1500] },
  { d: 'Tile — porcelain floor, set and grout', lo: 9, hi: 15, qty: [40, 220] },
  { d: 'Materials — PEX, fittings, shutoffs', lo: 140, hi: 620 },
  { d: 'Trip charge', lo: 49, hi: 89 },
  { d: 'Gutter cleaning, single story', lo: 1.1, hi: 1.6, qty: [90, 220] },
  { d: 'Repair fence section, replace 3 pickets and rail', lo: 180, hi: 340 },
  { d: 'HVAC tune-up, replace capacitor', lo: 189, hi: 310 },
  { d: 'Install vanity and top, reconnect supply and drain', lo: 380, hi: 640 },
  { d: 'Caulk tub surround and replace grab bar', lo: 95, hi: 160 },
  { d: 'Disposal — remove and replace 3/4 HP unit', lo: 260, hi: 410 },
  { d: 'Emergency after-hours call, leak at slab, locate and isolate', lo: 295, hi: 495 },
  { d: 'Baseboard trim, cut and install, paint-ready', lo: 3.5, hi: 6, qty: [40, 160] },
  { d: 'Permit fee (City of Garland), pass-through', lo: 75, hi: 260 },
  { d: 'Dumpster rental, 10 yd, 3 days', lo: 325, hi: 450 },
  { d: 'Demo existing shower to studs, bag and haul debris to transfer station', lo: 650, hi: 1200 },
  { d: 'Install LVP flooring incl. underlayment and transitions', lo: 3.25, hi: 4.75, qty: [120, 600] },
  { d: 'Replace exterior door slab, rehang, new weatherstrip', lo: 420, hi: 780 },
];

function lineItem() {
  const w = pick(WORK);
  const qty = w.qty ? int(w.qty[0], w.qty[1]) : int(1, 2);
  return { description: w.d, qty, unit_price: cents(w.lo + rand() * (w.hi - w.lo)) };
}
const total = (items: { qty: number; unit_price: number }[]) => cents(items.reduce((s, i) => s + i.qty * i.unit_price, 0));
const METHODS = ['zelle', 'zelle', 'cash', 'check', 'card', 'cashapp', 'other'] as const;

const payments: Row[] = [];
let invoiceNo = 1041;
let octCount = 0;
const TARGET_PAYMENTS = 100;

function addInvoice(client: string, items: ReturnType<typeof lineItem>[], plan: number[], firstInSeptember: boolean) {
  const id = `inv-${invoiceNo}`;
  const invoice = { client_name: client, invoice_number: invoiceNo++, kind: 'invoice', deleted_at: null, line_items: items };
  const amount = total(items);
  let paid = 0;
  plan.forEach((share, k) => {
    const sept = firstInSeptember && k === 0;
    if (!sept && octCount >= TARGET_PAYMENTS) return;
    const amt = k === plan.length - 1 ? cents(amount - paid) : cents(amount * share);
    paid = cents(paid + amt);
    const method = pick(METHODS);
    const stripe = method === 'card' || (method === 'cashapp' && rand() < 0.5);
    payments.push({
      id: `pay-${String(payments.length + 1).padStart(4, '0')}`,
      invoice_id: id,
      amount: amt.toFixed(2),
      paid_at: sept ? at(9, int(10, 29), int(9, 17)) : at(10, Math.min(31, 1 + k * 9 + int(0, 8)), int(8, 18)),
      method,
      stripe_checkout_session_id: stripe ? `cs_mock_${payments.length}` : null,
      invoices: invoice,
    });
    if (!sept) octCount++;
  });
}

// Anchor cases first: the full bathroom remodel (~$12.5k, 24 items, deposit in
// September + two October payments) and a 21-item job paid in three parts.
{
  const remodel = Array.from({ length: 24 }, lineItem);
  const scale = 12500 / total(remodel);
  remodel.forEach((li) => { li.unit_price = cents(li.unit_price * scale); });
  addInvoice('Henderson Family', remodel, [0.4, 0.35, 0.25], true);
  addInvoice('Brightview Property Management', Array.from({ length: 21 }, lineItem), [0.3, 0.3, 0.4], false);
  addInvoice('Riverbend Apartments', Array.from({ length: 27 }, lineItem), [0.5, 0.5], true);
}
for (let i = 0; octCount < TARGET_PAYMENTS; i++) {
  const client = CLIENTS[i % CLIENTS.length];
  const big = rand() < 0.08;
  const items = Array.from({ length: big ? int(20, 26) : int(1, 6) }, lineItem);
  const r = rand();
  const plan = r < 0.68 ? [1] : r < 0.9 ? [0.4, 0.6] : [0.3, 0.3, 0.4];
  addInvoice(client, items, plan, plan.length > 1 && rand() < 0.35);
}

// ── Expenses ──────────────────────────────────────────────────────────
const STORES: Record<ExpenseCategory, string[]> = {
  fuel: ['Shell', 'Exxon', 'Chevron', 'QuikTrip', "Buc-ee's", 'Valero', 'RaceTrac'],
  supplies: ['Home Depot', "Lowe's", 'Sherwin-Williams', 'Ferguson Plumbing Supply', 'Menards', 'Ace Hardware', 'Floor & Decor'],
  tools: ['Harbor Freight', 'Home Depot', 'Northern Tool', "Lowe's", 'Grainger', 'Tractor Supply'],
  food: ['Whataburger', 'Chick-fil-A', 'Subway', 'Taco Bueno', "McDonald's", 'Kolache Factory'],
  travel: ['La Quinta Inn', 'Southwest Airlines', 'DFW Airport Parking', 'NTTA TollTag', 'Holiday Inn Express'],
  maintenance: ['Jiffy Lube', 'Discount Tire', "O'Reilly Auto Parts", 'AutoZone', 'Firestone Complete Auto Care'],
  subscriptions: ['QuickBooks Online', 'Google Workspace', 'Jobber', 'Adobe', 'Dropbox'],
  phone: ['Verizon Wireless', 'T-Mobile', 'AT&T'],
  insurance: ['Progressive Commercial', 'State Farm', 'Next Insurance', 'The Hartford'],
  other: ['USPS', 'Staples', 'City of Garland Permits', 'U-Haul', 'Texas DMV'],
};
const WHAT: Record<ExpenseCategory, [string, number, number][]> = {
  fuel: [['Diesel, work truck', 65, 160], ['Unleaded, van', 38, 95], ['Gas for generator', 18, 42]],
  supplies: [['PEX, fittings and shutoff valves', 45, 420], ['Primer and two gallons eggshell', 60, 240], ['Drywall sheets, mud, tape', 55, 310], ['Caulk, sealant, painter\'s tape', 12, 60], ['Porcelain tile and thinset for the Patel master bath', 380, 1850]],
  tools: [['Cordless impact driver kit', 129, 289], ['Replacement drill bits and hole saw set', 24, 89], ['Drain snake, 50 ft', 79, 210], ['Wet tile saw', 349, 899]],
  food: [['Lunch for crew of 3', 22, 58], ['Coffee and breakfast tacos', 9, 24]],
  travel: [['Hotel, two nights for Tyler job', 180, 360], ['Flight to Houston supplier expo', 140, 320], ['Parking', 12, 36], ['Tolls', 6, 28]],
  maintenance: [['Oil change, work truck', 69, 129], ['Two tires, balance and rotate', 280, 520], ['Brake pads and rotors', 240, 610], ['Wiper blades and coolant', 24, 66]],
  subscriptions: [['Monthly plan', 30, 90], ['Annual renewal', 99, 420]],
  phone: [['Monthly business line', 65, 140], ['Replacement phone case and charger', 25, 70]],
  insurance: [['General liability, monthly', 89, 240], ['Commercial auto, monthly', 180, 420]],
  other: [['Certified mail to HOA board', 7, 14], ['Printer ink and invoice paper', 28, 85], ['Electrical permit', 75, 210], ['Trailer rental, 1 day', 29, 75]],
};
const NOTES = [
  'for the Henderson job — keep receipt for the HOA reimbursement request',
  'split with Carlos, he owes half',
  'returned two unused fittings, refund pending on card ending 4421',
  'emergency run, supplier closed early',
  'customer asked for upgraded fixtures, billed on INV-1052',
];

const expenses: Row[] = [];
let e = 0;
for (const cat of EXPENSE_CATEGORIES) {
  const n = cat === 'supplies' || cat === 'fuel' ? 20 : cat === 'tools' || cat === 'food' ? 12 : 6;
  for (let k = 0; k < n && expenses.length < 100; k++) {
    const [what, lo, hi] = pick(WHAT[cat]);
    const day = int(1, 31);
    const longNote = rand() < 0.2;
    expenses.push({
      id: `exp-${String(++e).padStart(4, '0')}`,
      amount: cents(lo + rand() * (hi - lo)).toFixed(2),
      category: cat,
      tax_deductible: rand() < 0.55,
      spent_on: `2026-10-${pad(day)}`,
      created_at: at(10, day, int(7, 19)),
      description: what,
      vendor: rand() < 0.08 ? null : pick(STORES[cat]),
      note: longNote ? pick(NOTES) : null,
      receipt_url: rand() < 0.6 ? `mock/${e}.jpg` : null,
      receipt_path: null,
    });
  }
}
// The long-name case, a legacy receipt_path, and the $4.99 / $12,500 ends of the range.
expenses[3].vendor = 'Sherwin-Williams Commercial Paint Store #4471 — North Dallas Contractor Distribution Center';
expenses[3].note = 'two 5-gal buckets of Emerald exterior for the Oak Hollow HOA clubhouse, color matched to the existing trim';
expenses[4].receipt_path = 'vault/legacy-receipt.jpg';
expenses[4].receipt_url = null;
Object.assign(expenses.find((x) => x.category === 'food')!, { amount: '4.99', description: 'Gatorade', vendor: 'QuikTrip' });
Object.assign(expenses.find((x) => x.category === 'tools')!, {
  amount: '12500.00', description: 'Used skid steer, down payment', vendor: 'Four Brothers Equipment', tax_deductible: true,
});
expenses.sort((a, b) => String(a.spent_on).localeCompare(String(b.spent_on)) || String(a.created_at).localeCompare(String(b.created_at)));

export const MOCK_COUNTS = { payments: octCount, clients: CLIENTS.length, expenses: expenses.length };

// ── Source ────────────────────────────────────────────────────────────
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const byPaidAt = (a: Row, b: Row) => String(a.paid_at).localeCompare(String(b.paid_at)) || String(a.id).localeCompare(String(b.id));

export const mockSource: SummaryPdfSource = {
  async profile() {
    return { business_name: 'Dynasty Home Services', logo_url: null, brand_colors: ['#1b3a5c', '#d4af37'], background_color: '#ffffff' };
  },
  async expenses(range) {
    return expenses.filter((x) => String(x.spent_on) >= range.start && String(x.spent_on) <= range.end);
  },
  async payments(range) {
    return payments
      .filter((p) => { const d = localDay(String(p.paid_at)); return d >= range.start && d <= range.end; })
      .sort(byPaidAt);
  },
  async paymentHistory(ids) {
    const want = new Set(ids);
    return payments.filter((p) => want.has(String(p.invoice_id))).sort(byPaidAt).map((p) => ({ id: p.id, invoice_id: p.invoice_id }));
  },
};
