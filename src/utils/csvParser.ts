import { Dataset } from '../types';

export function parseCSV(text: string, filename = 'Uploaded Dataset'): Dataset {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || !lines[0]) {
    throw new Error('The uploaded file is empty.');
  }

  // Detect delimiter (comma or semicolon)
  let delimiter = ',';
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  if (semicolonCount > commaCount) {
    delimiter = ';';
  }

  // Parse headers: strip outer quotes and trim whitespace
  const columns = firstLine
    .split(delimiter)
    .map(col => col.replace(/^["']|["']$/g, '').trim())
    .filter(col => col !== '');

  if (columns.length === 0) {
    throw new Error('No valid columns found in the header row.');
  }

  const rows: Record<string, number>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty rows

    // Simple splitter (does not handle nested commas in quotes, but standard datasets are plain numeric)
    const values = line.split(delimiter);
    const row: Record<string, number> = {};
    let hasValidData = false;

    columns.forEach((col, idx) => {
      const valStr = values[idx]?.replace(/^["']|["']$/g, '').trim() ?? '';
      const valNum = parseFloat(valStr);
      row[col] = isNaN(valNum) ? 0 : valNum;
      if (valStr !== '') {
        hasValidData = true;
      }
    });

    if (hasValidData) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw new Error('The dataset contains no valid numeric data rows.');
  }

  return {
    name: `${filename} (N=${rows.length})`,
    columns,
    rows
  };
}
