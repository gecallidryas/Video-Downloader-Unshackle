/**
 * Dean Edwards JavaScript packer unpacker.
 * Ported from UnifiedVideoDownloader/scripts/detection/host-plugins.js
 */

const PACKER_RE =
  /eval\(function\(p,a,c,k,e,(?:d|r)\)\{[\s\S]*?\}\(\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])((?:\\.|(?!\5)[\s\S])*)\5\.split\(\s*['"]\|['"]\s*\)/;

function unescapeJsStringLiteral(content: string): string {
  const s = String(content || '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }

    i++;
    if (i >= s.length) break;
    const esc = s[i];

    switch (esc) {
      case 'n':
        out += '\n';
        break;
      case 'r':
        out += '\r';
        break;
      case 't':
        out += '\t';
        break;
      case 'b':
        out += '\b';
        break;
      case 'f':
        out += '\f';
        break;
      case 'v':
        out += '\v';
        break;
      case '0':
        out += '\0';
        break;
      case '\\':
        out += '\\';
        break;
      case '"':
        out += '"';
        break;
      case "'":
        out += "'";
        break;
      case 'x': {
        const hex = s.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 2;
        } else {
          out += 'x';
        }
        break;
      }
      case 'u': {
        if (s[i + 1] === '{') {
          const end = s.indexOf('}', i + 2);
          const hex = end === -1 ? '' : s.slice(i + 2, end);
          if (hex && /^[0-9a-fA-F]+$/.test(hex)) {
            out += String.fromCodePoint(parseInt(hex, 16));
            i = end;
          } else {
            out += 'u';
          }
        } else {
          const hex = s.slice(i + 1, i + 5);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
          } else {
            out += 'u';
          }
        }
        break;
      }
      default:
        out += esc;
        break;
    }
  }
  return out;
}

function toBase(num: number, radix: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const base = Math.max(2, Math.min(chars.length, Number(radix) || 0));
  let n = Math.max(0, Number(num) || 0);
  let out = '';
  do {
    out = chars[n % base] + out;
    n = Math.floor(n / base);
  } while (n > 0);
  return out;
}

export function unpackDeanEdwardsPacker(packed: string): string {
  const match = String(packed || '').match(PACKER_RE);
  if (!match) return '';

  const packedCode = unescapeJsStringLiteral(match[2] ?? '');
  const radix = parseInt(match[3] ?? '0', 10);
  const count = parseInt(match[4] ?? '0', 10);
  const symbols = unescapeJsStringLiteral(match[6] ?? '').split('|');

  if (!packedCode || !Number.isFinite(radix) || !Number.isFinite(count) || count <= 0) return '';

  const dict: Record<string, string> = Object.create(null) as Record<string, string>;
  for (let i = count - 1; i >= 0; i--) {
    const key = toBase(i, radix);
    dict[key] = symbols[i] || key;
  }

  return packedCode.replace(/\b\w+\b/g, (word) => {
    return Object.prototype.hasOwnProperty.call(dict, word) ? dict[word] : word;
  });
}
