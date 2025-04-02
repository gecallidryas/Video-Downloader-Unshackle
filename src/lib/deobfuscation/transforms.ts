/**
 * String deobfuscation transforms for VOE and similar hosts.
 * Ported from UnifiedVideoDownloader/scripts/detection/host-plugins.js
 */

export function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const code = c.charCodeAt(0) + 13;
    const cap = c <= 'Z' ? 90 : 122;
    return String.fromCharCode(cap >= code ? code : code - 26);
  });
}

export function removeSpecialSequences(input: string): string {
  return input
    .replaceAll('@$', '')
    .replaceAll('^^', '')
    .replaceAll('~@', '')
    .replaceAll('%?', '')
    .replaceAll('*~', '')
    .replaceAll('!!', '')
    .replaceAll('#&', '');
}

export function shiftString(input: string): string {
  let shifted = '';
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    shifted += String.fromCharCode(char - 3);
  }
  return shifted;
}
