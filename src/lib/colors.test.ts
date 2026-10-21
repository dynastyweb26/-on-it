import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTheme, explicitColorRoles } from './colors';

test('buildTheme keeps legacy scoring when roles are not passed', () => {
  const theme = buildTheme(['#1A1A1A', '#D4A017'], '#1A1A1A');
  assert.equal(theme.accent, '#D4A017');
  assert.equal(theme.primary, '#D4A017');
});

test('buildTheme honors explicit accent and secondary roles', () => {
  const theme = buildTheme(
    ['#FFFFFF', '#2F5FE8', '#B91C1C'],
    '#FFFFFF',
    { accent: '#2F5FE8', secondary: '#B91C1C' },
  );
  assert.equal(theme.accent, '#2F5FE8');
  assert.equal(theme.primary, '#B91C1C');
});

test('buildTheme follows accent when there is no secondary', () => {
  const theme = buildTheme(
    ['#FFFFFF', '#2F5FE8'],
    '#FFFFFF',
    { accent: '#2F5FE8', secondary: null },
  );
  assert.equal(theme.accent, '#2F5FE8');
  assert.equal(theme.primary, '#2F5FE8');
});

test('explicitColorRoles reads role-ordered colors', () => {
  assert.deepEqual(
    explicitColorRoles(['#1A1A1A', '#D4A017', '#FFFFFF'], '#1A1A1A'),
    { accent: '#D4A017', secondary: '#FFFFFF' },
  );
  assert.deepEqual(
    explicitColorRoles(['#1A1A1A', '#D4A017'], '#1A1A1A'),
    { accent: '#D4A017', secondary: null },
  );
  assert.equal(explicitColorRoles(['#1A1A1A'], '#1A1A1A'), null);
});
