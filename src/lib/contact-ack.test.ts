import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingContactAck } from './contact-ack';

const FIELDS = { phone: '9453444550', email: 'deffeu@gmail.com', address: '2407 neff ln forney tx' };

test('names only the fields the reply left out', () => {
  assert.equal(
    missingContactAck('Car wash for Brandon (945-344-4550, deffeu@gmail.com), 2407 Neff Lane, Forney, TX.', FIELDS),
    '',
  );
  assert.equal(
    missingContactAck('Car wash for Brandon, 2407 Neff Lane, Forney, TX.', FIELDS),
    '9453444550, deffeu@gmail.com',
  );
});

test('empty when nothing was captured — never names a field the user did not give', () => {
  assert.equal(missingContactAck('On it! Who is this for?', { phone: null, email: null, address: '  ' }), '');
});

test('covers a field the reply skipped entirely', () => {
  assert.equal(missingContactAck('Car wash for Brandon.', { phone: '9453444550', email: null, address: null }), '9453444550');
});

test('email already echoed in prose is not repeated', () => {
  assert.equal(
    missingContactAck('Send it to deffeu@gmail.com when ready.', { phone: null, email: 'deffeu@gmail.com', address: null }),
    '',
  );
});
