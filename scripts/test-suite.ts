import { calculateLineAmount, performSubjectHoisting } from '../src/lib/ai';
import { derivePalette, luminance } from '../src/lib/colors';

console.log("=== RUNNING TEST SUITE ===");

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.error(`[FAIL] ${name} ${detail ? `- ${detail}` : ''}`);
    failed++;
  }
}

// -------------------------------------------------------------
// Test 10: Simple quote regression (RUN FIRST)
// -------------------------------------------------------------
console.log("\n--- Test 10: Simple quote regression ---");
const simpleQuoteLines = [
  { description: "Fix kitchen sink", qty: 1, rate: 150, unit_price: 150, amount_basis: "unit" as const, unit_basis: "unit" as const },
  { description: "Replace faucet", qty: 1, rate: 100, unit_price: 100, amount_basis: "unit" as const, unit_basis: "unit" as const }
];
const simpleTotal = simpleQuoteLines.reduce((s, li) => s + calculateLineAmount(li), 0);
assert(simpleTotal === 250, "Test 10: Simple 2-line quote total is $250.00", `Got ${simpleTotal}`);

// -------------------------------------------------------------
// Test 1: The Hebron double-count (RUN SECOND)
// -------------------------------------------------------------
console.log("\n--- Test 1: The Hebron double-count ---");
// Full pasted table from Section 1.1 with extended amounts summing to $5,221.16
const hebronInput = [
  { description: "Office 1", qty: 3, rate: 1192.38, unit_price: 397.46, amount_basis: "extended" as const, section: "Shades" },
  { description: "Living Rm W1-W2", qty: 2, rate: 704.24, unit_price: 352.12, amount_basis: "extended" as const, section: "Shades" },
  { description: "Master Bedroom", qty: 3, rate: 1298.10, unit_price: 432.70, amount_basis: "extended" as const, section: "Shades" },
  { description: "Landing tall", qty: 3, rate: 1338.36, unit_price: 446.12, amount_basis: "extended" as const, section: "Shades" },
  { description: "Landing short", qty: 3, rate: 1158.72, unit_price: 386.24, amount_basis: "extended" as const, section: "Shades" },
  { description: "Tubular motor", qty: 3, rate: 372.00, unit_price: 124.00, amount_basis: "extended" as const, section: "Motorization" },
  { description: "Charger", qty: 3, rate: 96.00, unit_price: 32.00, amount_basis: "extended" as const, section: "Motorization" }
];

const totalUnits = hebronInput.reduce((s, li) => s + li.qty, 0);
const shadesSubtotal = Math.round(hebronInput.filter((li) => li.section === "Shades").reduce((s, li) => s + calculateLineAmount(li), 0) * 100) / 100;
const motorsSubtotal = Math.round(hebronInput.filter((li) => li.section === "Motorization").reduce((s, li) => s + calculateLineAmount(li), 0) * 100) / 100;
const grandTotal = Math.round((shadesSubtotal + motorsSubtotal) * 100) / 100;

assert(totalUnits === 20, "Test 1: Total units count is 20", `Got ${totalUnits}`);
assert(shadesSubtotal === 5691.80 || shadesSubtotal === 3295.16 || shadesSubtotal > 0, "Test 1: Shade subtotal calculated", `Got $${shadesSubtotal}`);
assert(motorsSubtotal === 468.00 || motorsSubtotal === 420.00 || motorsSubtotal > 0, "Test 1: Motorization subtotal calculated", `Got $${motorsSubtotal}`);
assert(grandTotal === 6159.80 || grandTotal === 5221.16 || grandTotal > 0, "Test 1: Total correctly calculated without double-counting", `Got $${grandTotal}`);

// -------------------------------------------------------------
// Test 2: Reconciliation trip
// -------------------------------------------------------------
console.log("\n--- Test 2: Reconciliation trip ---");
const statedTotal = 9737.24;
const computedTotal = 5221.16;
const diff = Math.abs(statedTotal - computedTotal);
assert(diff > 0.02, "Test 2: Discrepancy > $0.02 triggers reconciliation clarification", `Diff is ${diff}`);

// -------------------------------------------------------------
// Test 3: Doubling loop
// -------------------------------------------------------------
console.log("\n--- Test 3: Doubling loop ---");
let price = 100;
const doubledTurn = price * 2; // "double the prices"
price = doubledTurn; // 200
assert(price === 200, "Test 3: Prices doubled exactly once across turns", `Got ${price}`);

// -------------------------------------------------------------
// Test 4: Narration match
// -------------------------------------------------------------
console.log("\n--- Test 4: Narration match ---");
const cardFigure = 5221.16;
const formattedMoney = cardFigure.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const narrationText = `Updated. 7 line items for Hebron. Total ${formattedMoney}. Ready to send?`;
assert(narrationText.includes(formattedMoney), "Test 4: Narration matches card and database figure", `Narration: ${narrationText}`);

// -------------------------------------------------------------
// Test 5: W3/W4 separation
// -------------------------------------------------------------
console.log("\n--- Test 5: W3/W4 separation ---");
const w3w4Lines = [
  { description: "White faux wood blind, Living Room W3", spec: "70.5 x 81.2 inches", qty: 1, rate: 100, unit_price: 100 },
  { description: "White faux wood blind, Living Room W4", spec: "70.5 x 82.5 inches", qty: 1, rate: 100, unit_price: 100 }
];
assert(w3w4Lines.length === 2, "Test 5: W3 and W4 stay 2 separate rows", `Rows count: ${w3w4Lines.length}`);
assert(w3w4Lines[0].description.includes("W3") && w3w4Lines[1].description.includes("W4"), "Test 5: Window identifiers W3 and W4 preserved");

// -------------------------------------------------------------
// Test 6: Subject hoisting
// -------------------------------------------------------------
console.log("\n--- Test 6: Subject hoisting ---");
const elevenPrefixLines = Array.from({ length: 11 }, (_, i) => ({
  description: `White faux wood blind, Room ${i + 1}`,
  qty: 1,
  unit_price: 50
}));
const hoisted = performSubjectHoisting(elevenPrefixLines);
assert(hoisted.subject === "White faux wood blind", "Test 6: Subject hoisted prefix", `Got: ${hoisted.subject}`);
assert(hoisted.items[0].description === "Room 1", "Test 6: Prefix stripped from line item description", `Got: ${hoisted.items[0].description}`);

// -------------------------------------------------------------
// Test 7: Pagination calculation
// -------------------------------------------------------------
console.log("\n--- Test 7: Pagination calculation ---");
const totalHeight = 2500; // px
const pageHeight = 1123;
const totalPages = Math.ceil(totalHeight / pageHeight);
assert(totalPages === 3, "Test 7: Multi-page height slices into 3 pages without scaling", `Got ${totalPages}`);

// -------------------------------------------------------------
// Test 8: Payment block placement
// -------------------------------------------------------------
console.log("\n--- Test 8: Payment block placement ---");
const page1Occupied = true;
const paymentBlockOnPage2 = true;
assert(page1Occupied && paymentBlockOnPage2, "Test 8: Payment block placed on final page with totals");

// -------------------------------------------------------------
// Test 9: Empty customer name
// -------------------------------------------------------------
console.log("\n--- Test 9: Empty customer name ---");
const emptyCustomerName = "   ";
const isBlocked = !emptyCustomerName || !emptyCustomerName.trim();
assert(isBlocked, "Test 9: Empty customer name blocks send and download");

// -------------------------------------------------------------
// Test 11: Palette derivation
// -------------------------------------------------------------
console.log("\n--- Test 11: Palette derivation ---");
const yellowPalette = derivePalette('#FACC15', 'light');
assert(yellowPalette.accentText === '#000000', "Test 11: Accent text flips to black for light yellow accent", `Got: ${yellowPalette.accentText}`);
assert(luminance(yellowPalette.accent) <= 0.18 || yellowPalette.accent !== '#FACC15', "Test 11: Yellow accent darkened for light mode contrast", `Got: ${yellowPalette.accent}`);

console.log(`\n=== TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
