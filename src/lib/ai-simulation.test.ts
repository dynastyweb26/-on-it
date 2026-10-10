import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeForAI } from './sanitize';

// Simulated dense, multi-line spoken/text user inputs
const SIMULATED_PROMPTS = [
  {
    name: 'Complex multi-line job with deposit, address, phone, and notes',
    input: `I did a big repair job for the Johnsons over at 742 Evergreen Terrace.
    First we replaced 4 broken fence panels at 85 bucks each.
    Then we hauled away 2 truckloads of yard debris at 150 per load.
    Also installed a new ceiling fan in the master bedroom for 200 flat.
    Her cell number is 555-0199.
    Require a 40 percent deposit before we order the custom gate latch.
    Note that work is guaranteed for 90 days.`,
  },
  {
    name: 'Bid proposal for commercial client with hourly rates and square footage',
    input: `Bid for Acme Commercial Roofing at 100 Industrial Parkway.
    Tear off old shingles: 1200 sq ft at 2.50 per sq ft.
    Subfloor repair: 8 hours at 75 per hour.
    New architectural shingles installation: 1200 sq ft at 4.25 per sq ft.
    A third down required up front.
    Note: Permit fees included in price.`,
  },
  {
    name: 'Dense list of quick service items and parts',
    input: `Invoice for Marcus Miller.
    Unclogged kitchen sink drain 120 dollars.
    Replaced garbage disposal unit 250 dollars.
    Replaced p-trap pipe materials 45 dollars.
    8 percent sales tax applies.
    Due in 14 days.`,
  },
];

test('simulation prompts: inputs sanitize cleanly for AI consumption', () => {
  for (const sim of SIMULATED_PROMPTS) {
    const sanitized = sanitizeForAI(sim.input);
    assert.ok(sanitized.length > 0, `Sanitized string for ${sim.name} should not be empty`);
    assert.ok(!/<script>/i.test(sanitized), `Sanitized string for ${sim.name} should strip tags`);
  }
});
