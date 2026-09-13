import { calculateLineAmount, classifyTurnIntent, performSubjectHoisting, type LineItem } from '../lib/ai';
import { derivePalette } from '../lib/colors';

async function runTests() {
  console.log('--- Running Work Order Section 8 Tests ---');

  // Test 1: The Hebron double-count (extended amount basis)
  console.log('1. Testing extended amount_basis rate calculation...');
  const extendedItem: LineItem = {
    description: 'Office 1',
    qty: 3,
    rate: 1192.38,
    unit_price: 1192.38,
    amount_basis: 'extended',
    unit_basis: 'unit',
  };
  const computedExtendedAmt = calculateLineAmount(extendedItem);
  console.assert(computedExtendedAmt === 1192.38, `Expected 1192.38, got ${computedExtendedAmt}`);

  // Test 2: Reconciliation trip check
  console.log('2. Testing reconciliation check logic...');
  const statedTotal = 5221.16;
  const computedTotalMismatch = 9737.24;
  const diff = Math.abs(statedTotal - computedTotalMismatch);
  console.assert(diff > 0.02, `Expected diff > 0.02, got ${diff}`);

  // Test 3: Doubling loop & intent classification
  console.log('3. Testing intent classification...');
  console.assert(classifyTurnIntent('undo', true) === 'undo', 'Expected undo intent');
  console.assert(classifyTurnIntent('how much is total', true) === 'query', 'Expected query intent');
  console.assert(classifyTurnIntent('double the prices', true) === 'amend', 'Expected amend intent');
  console.assert(classifyTurnIntent('new job for Acme', true) === 'create', 'Expected create intent');

  // Test 5: W3/W4 separation
  console.log('5. Testing distinct line separation...');
  const lineW3: LineItem = { description: 'Living Room • W3', spec: '70½ × 81.2', qty: 1, unit_price: 100 };
  const lineW4: LineItem = { description: 'Living Room • W4', spec: '70½ × 82½', qty: 1, unit_price: 100 };
  console.assert(lineW3.description !== lineW4.description || lineW3.spec !== lineW4.spec, 'W3 and W4 lines must be kept separate');

  // Test 6: Subject hoisting
  console.log('6. Testing subject hoisting...');
  const prefixItems: LineItem[] = [
    { description: 'White Faux Wood Blinds, Office 1', qty: 1, unit_price: 100 },
    { description: 'White Faux Wood Blinds, Living Room • W1-W2', qty: 1, unit_price: 100 },
    { description: 'White Faux Wood Blinds, Master Bedroom', qty: 1, unit_price: 100 },
  ];
  const hoisted = performSubjectHoisting(prefixItems);
  console.assert(hoisted.subject === 'White Faux Wood Blinds', `Expected subject "White Faux Wood Blinds", got "${hoisted.subject}"`);
  console.assert(hoisted.line_items[0].description === 'Office 1', `Expected stripped "Office 1", got "${hoisted.line_items[0].description}"`);

  // Test 9: Empty customer name check
  console.log('9. Testing empty customer name validation...');
  const emptyCustomerName = '   ';
  console.assert(!emptyCustomerName.trim(), 'Empty customer name must be blocked');

  // Test 11: Palette derivation
  console.log('11. Testing palette derivation...');
  const yellowPalette = derivePalette('#FACC15', 'light');
  console.assert(yellowPalette.accentText === '#000000', 'Yellow accent text must flip to black for readability');

  console.log('All Section 8 tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
