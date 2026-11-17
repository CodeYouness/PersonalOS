/**
 * The one CSV reader the import scripts share (the DEGIRO import, the
 * statement import). RFC 4180: quoted fields, doubled quotes, commas and
 * newlines inside quotes, CRLF or LF, an optional byte-order mark and an
 * optional trailing newline. Never `split(',')`: a description with a comma
 * in it is one field.
 *
 * Plain Node, relative imports only.
 */

/**
 * The file's records, each with the line it starts on (the header is line
 * 1), blank records left out.
 *
 * @param {string} text
 * @returns {{ line: number, cells: string[] }[]}
 */
export function parseCsvRecords(text) {
  /** @type {{ line: number, cells: string[] }[]} */
  const records = [];
  /** @type {string[]} */
  let record = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  const source = text.codePointAt(0) === 0xfeff ? text.slice(1) : text;
  for (let at = 0; at < source.length; at += 1) {
    const char = source[at];
    if (quoted) {
      if (char === '"' && source[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else {
        if (char === '\n') line += 1;
        field += char;
      }
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[at + 1] === '\n') at += 1;
      record.push(field);
      field = '';
      records.push({ line: startLine, cells: record });
      record = [];
      line += 1;
      startLine = line;
    } else field += char;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push({ line: startLine, cells: record });
  }
  return records.filter((r) => r.cells.some((cell) => cell.trim() !== ''));
}

/**
 * The file's records as rows of cells, blank records left out.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  return parseCsvRecords(text).map((record) => record.cells);
}
