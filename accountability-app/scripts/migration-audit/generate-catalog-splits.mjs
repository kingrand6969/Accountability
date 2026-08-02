import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const entries = [
  ['relation', 'catalog-01-relation-readonly.sql'],
  ['relation_privilege', 'catalog-02-relation-privilege-readonly.sql'],
  ['column', 'catalog-03-column-readonly.sql'],
  ['column_privilege', 'catalog-04-column-privilege-readonly.sql'],
  ['constraint', 'catalog-05-constraint-readonly.sql'],
  ['routine_privilege', 'catalog-06-routine-privilege-readonly.sql'],
  ['index', 'catalog-07-index-readonly.sql'],
  ['policy', 'catalog-08-policy-readonly.sql'],
  ['view', 'catalog-09-view-readonly.sql'],
  ['materialized_view', 'catalog-10-materialized-view-readonly.sql'],
  ['sequence', 'catalog-11-sequence-readonly.sql'],
  ['type', 'catalog-12-type-readonly.sql'],
  ['routine', 'catalog-13-routine-readonly.sql'],
  ['trigger', 'catalog-14-trigger-readonly.sql'],
  ['table_grant', 'catalog-15-table-grant-readonly.sql'],
  ['default_privilege', 'catalog-16-default-privilege-readonly.sql'],
  ['extension', 'catalog-17-extension-readonly.sql'],
  ['publication', 'catalog-18-publication-readonly.sql'],
  ['storage_bucket', 'catalog-19-storage-bucket-readonly.sql'],
];
const source = readFileSync(path.join(directory, 'catalog-readonly.sql'), 'utf8');
const selects = [...source.matchAll(/^select [\s\S]*?(?=^select |^rollback;)/gm)]
  .map((match) => match[0].trim());
if (selects.length !== entries.length) throw new Error('Catalog SELECT count drift.');
const prefix = [
  'begin read only;',
  "set local statement_timeout = '10s';",
  "set local lock_timeout = '2s';",
  "set local idle_in_transaction_session_timeout = '15s';",
  '',
].join('\n');
for (let index = 0; index < entries.length; index += 1) {
  const [category, filename] = entries[index];
  const select = selects[index];
  if (!select.startsWith(`select '${category}' as category,`)) {
    throw new Error(`Catalog category/order drift: ${filename}.`);
  }
  writeFileSync(path.join(directory, filename), `${prefix}${select}\n\nrollback;\n`);
}

const unionTerms = selects.map((select) => `(\n${select.replace(/;$/, '')}\n)`);
const orderCases = entries.map(
  ([category], index) => `           when '${category}' then ${index + 1}`,
);
const unionSql = `${prefix}select category, object_key, definition\n` +
  '  from (\n' +
  `${unionTerms.join('\nunion all\n')}\n` +
  '       ) as catalog_rows\n' +
  ' order by case category\n' +
  `${orderCases.join('\n')}\n` +
  '           else 20\n' +
  '          end,\n' +
  '          object_key;\n\nrollback;\n';
writeFileSync(path.join(directory, 'catalog-union-readonly.sql'), unionSql);

const diagnosticRanges = [];
function addDiagnosticRange(start, end) {
  if (start === end) return;
  diagnosticRanges.push([start, end]);
  const midpoint = Math.floor((start + end) / 2);
  addDiagnosticRange(start, midpoint);
  addDiagnosticRange(midpoint + 1, end);
}
addDiagnosticRange(1, 10);
addDiagnosticRange(11, 19);
for (const [start, end] of diagnosticRanges) {
  const subsetTerms = selects.slice(start - 1, end)
    .map((select) => `(\n${select.replace(/;$/, '')}\n)`);
  const subsetCases = entries.slice(start - 1, end).map(
    ([category], index) => `           when '${category}' then ${start + index}`,
  );
  const subsetSql = `${prefix}select category, object_key, definition\n` +
    '  from (\n' +
    `${subsetTerms.join('\nunion all\n')}\n` +
    '       ) as catalog_rows\n' +
    ' order by case category\n' +
    `${subsetCases.join('\n')}\n` +
    '           else 20\n' +
    '          end,\n' +
    '          object_key;\n\nrollback;\n';
  const filename =
    `catalog-diagnostic-${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}-readonly.sql`;
  writeFileSync(path.join(directory, filename), subsetSql);
}
