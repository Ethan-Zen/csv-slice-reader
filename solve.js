// A dependency-free drop-in for csv-reader 1.0.0: run(input) returns {columns, rows, errors} exactly as the
// reference does, reading the text once, left to right, and slicing its fields instead of growing strings a
// character at a time. The policy is the reference's, edge for edge: BOM, blank lines, stray CR, doubled
// quotes, CRLF and lone CR inside quotes, junk after a closing quote, unterminated quotes, short and long
// rows, and the line/row each error names.

const COMMA = 1;
const BREAK = 2;
const END = 3;
const EMPTY = '';
const QUOTE = 34;
const COMMA_CODE = 44;
const LF = 10;
const CR = 13;

// Where the three rare paths leave what they read, so the hot loop keeps its own state in locals: a helper
// hands back the cursor, the line, and the field.
const out = { i: 0, line: 1, value: EMPTY, ended: 0 };

/** Unquoted characters from i, appended to `value`: a stray CR is dropped, a comma or a line break ends it. */
function readTail(text, n, i, line, recordLine, recordRow, errors, value, junk) {
  let added = 0;
  let segStart = i;
  let parts = null;
  let ended = 0;
  for (;;) {
    let j = i;
    while (j < n) {
      const cc = text.charCodeAt(j);
      if (cc === COMMA_CODE || cc === LF || cc === CR) break;
      j += 1;
    }
    if (j > segStart) {
      if (parts === null) parts = [];
      parts.push(text.slice(segStart, j));
      added += j - segStart;
    }
    if (j >= n) {
      i = n;
      ended = END;
      break;
    }
    const cc = text.charCodeAt(j);
    if (cc === COMMA_CODE) {
      i = j + 1;
      ended = COMMA;
      break;
    }
    if (cc === LF) {
      i = j + 1;
      line += 1;
      ended = BREAK;
      break;
    }
    if (text.charCodeAt(j + 1) === LF) {
      i = j + 2;
      line += 1;
      ended = BREAK;
      break;
    }
    errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
    i = j + 1;
    segStart = i;
  }
  if (parts !== null) {
    const tail = parts.length === 1 ? parts[0] : parts.join('');
    value = value === EMPTY ? tail : value + tail;
  }
  if (junk && added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  out.i = i;
  out.line = line;
  out.value = value;
  out.ended = ended;
}

/** A quoted field whose opening quote is at i: to the next quote that is not doubled. */
function readQuoted(text, n, i, line, recordLine, recordRow, errors) {
  const open = i;
  const openLine = line;
  let j = i + 1;
  let segs = null;
  let segStart = j;
  let value = EMPTY;
  let closed = false;
  for (;;) {
    while (j < n) {
      const cc = text.charCodeAt(j);
      if (cc === QUOTE || cc === CR || cc === LF) break;
      j += 1;
    }
    if (j >= n) break;
    const cc = text.charCodeAt(j);
    if (cc === QUOTE) {
      if (j + 1 < n && text.charCodeAt(j + 1) === QUOTE) {
        if (segs === null) segs = [];
        segs.push(text.slice(segStart, j), '"');
        j += 2;
        segStart = j;
        continue;
      }
      if (segs === null) value = text.slice(segStart, j);
      else {
        segs.push(text.slice(segStart, j));
        value = segs.join('');
      }
      i = j + 1;
      closed = true;
      break;
    }
    // CRLF and a lone CR inside quotes are each one LF.
    if (segs === null) segs = [];
    segs.push(text.slice(segStart, j), '\n');
    line += 1;
    if (cc === CR) j += text.charCodeAt(j + 1) === LF ? 2 : 1;
    else j += 1;
    segStart = j;
  }
  if (!closed) {
    // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
    errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
    readTail(text, n, open + 1, openLine, recordLine, recordRow, errors, '"', false);
    return;
  }
  if (i >= n) {
    out.i = i;
    out.line = line;
    out.value = value;
    out.ended = END;
    return;
  }
  const after = text.charCodeAt(i);
  if (after === COMMA_CODE) {
    out.i = i + 1;
    out.line = line;
    out.value = value;
    out.ended = COMMA;
    return;
  }
  if (after === LF) {
    out.i = i + 1;
    out.line = line + 1;
    out.value = value;
    out.ended = BREAK;
    return;
  }
  if (after === CR && text.charCodeAt(i + 1) === LF) {
    out.i = i + 2;
    out.line = line + 1;
    out.value = value;
    out.ended = BREAK;
    return;
  }
  // What follows the closing quote is appended as it stands.
  readTail(text, n, i, line, recordLine, recordRow, errors, value, true);
}

/** One CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const n = text.length;
  const header = input.header === true;
  const rows = [];
  const errors = [];
  let columns = null;
  let width = -1;
  let rowCount = 0;
  let i = n !== 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  while (i < n) {
    // A line left with no characters is no record.
    let c = text.charCodeAt(i);
    while (c === LF || (c === CR && text.charCodeAt(i + 1) === LF)) {
      i += c === LF ? 1 : 2;
      line += 1;
      if (i >= n) break;
      c = text.charCodeAt(i);
    }
    if (i >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rowCount;
    const fields = [];
    // Only one field, empty and unquoted, is no record: so the record's own first character decides it.
    const startsQuoted = text.charCodeAt(i) === QUOTE;

    for (;;) {
      if (text.charCodeAt(i) === QUOTE) {
        readQuoted(text, n, i, line, recordLine, recordRow, errors);
        i = out.i;
        line = out.line;
        fields.push(out.value);
        if (out.ended !== COMMA) break;
        continue;
      }
      // The common field by far: no quote, no stray CR.
      const start = i;
      let j = i;
      let cc = 0;
      while (j < n) {
        cc = text.charCodeAt(j);
        if (cc === COMMA_CODE || cc === LF || cc === CR) break;
        j += 1;
      }
      if (j >= n) {
        fields.push(text.slice(start, j));
        i = n;
        break;
      }
      if (cc === COMMA_CODE) {
        fields.push(text.slice(start, j));
        i = j + 1;
        continue;
      }
      if (cc === LF) {
        fields.push(text.slice(start, j));
        i = j + 1;
        line += 1;
        break;
      }
      if (text.charCodeAt(j + 1) === LF) {
        fields.push(text.slice(start, j));
        i = j + 2;
        line += 1;
        break;
      }
      // A CR not followed by LF is dropped: nowhere near the common path.
      readTail(text, n, j, line, recordLine, recordRow, errors, j === start ? EMPTY : text.slice(start, j), false);
      i = out.i;
      line = out.line;
      fields.push(out.value);
      if (out.ended !== COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === EMPTY && !startsQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push(EMPTY);
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
    rowCount += 1;
  }
  return { columns: header ? (columns === null ? [] : columns) : null, rows, errors };
}
