import * as XLSX from 'xlsx';
import { Dataset } from '../types';

export function parseExcel(data: ArrayBuffer, filename = 'Uploaded Dataset'): Dataset {
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded Excel file contains no worksheets.');
  }
  
  const worksheet = workbook.Sheets[firstSheetName];
  
  // sheet_to_json with header: 1 returns an array of arrays representing the sheet
  const sheetRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
  if (sheetRows.length === 0) {
    throw new Error('The uploaded Excel worksheet is empty.');
  }

  // Find the header row (first row with any content)
  const headerRow = sheetRows[0];
  if (!headerRow || headerRow.length === 0) {
    throw new Error('No columns found in the header row of the Excel sheet.');
  }

  // Extract column names, trim and clean
  const columns = headerRow
    .map((col: any) => String(col ?? '').trim())
    .filter((col: string) => col !== '');

  if (columns.length === 0) {
    throw new Error('No valid columns found in the header row of the Excel sheet.');
  }

  const rows: Record<string, number>[] = [];

  for (let i = 1; i < sheetRows.length; i++) {
    const values = sheetRows[i];
    if (!values || values.length === 0) continue;

    // Check if the row contains at least one non-empty value
    const row: Record<string, number> = {};
    let hasValidData = false;

    columns.forEach((col, idx) => {
      const valRaw = values[idx];
      let valNum = 0;
      
      if (typeof valRaw === 'number') {
        valNum = valRaw;
      } else if (valRaw !== undefined && valRaw !== null) {
        valNum = parseFloat(String(valRaw).trim());
      }
      
      row[col] = isNaN(valNum) ? 0 : valNum;
      
      if (valRaw !== undefined && valRaw !== null && String(valRaw).trim() !== '') {
        hasValidData = true;
      }
    });

    if (hasValidData) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw new Error('The Excel sheet contains no valid numeric data rows.');
  }

  return {
    name: `${filename} (N=${rows.length})`,
    columns,
    rows
  };
}
