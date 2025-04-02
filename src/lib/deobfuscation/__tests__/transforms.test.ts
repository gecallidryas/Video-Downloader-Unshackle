import { describe, expect, test } from 'vitest';
import { rot13, removeSpecialSequences, shiftString } from '../transforms';

describe('rot13', () => {
  test('transforms a known string', () => {
    expect(rot13('Hello World')).toBe('Uryyb Jbeyq');
  });

  test('is its own inverse — applying twice returns the original', () => {
    const input = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    expect(rot13(rot13(input))).toBe(input);
  });

  test('leaves non-alpha characters unchanged', () => {
    expect(rot13('123 !@# test')).toBe('123 !@# grfg');
  });

  test('handles empty string', () => {
    expect(rot13('')).toBe('');
  });

  test('wraps uppercase Z correctly', () => {
    expect(rot13('Z')).toBe('M');
    expect(rot13('M')).toBe('Z');
  });

  test('wraps lowercase z correctly', () => {
    expect(rot13('z')).toBe('m');
    expect(rot13('m')).toBe('z');
  });
});

describe('removeSpecialSequences', () => {
  test('removes all seven special sequences', () => {
    expect(removeSpecialSequences('@$')).toBe('');
    expect(removeSpecialSequences('^^')).toBe('');
    expect(removeSpecialSequences('~@')).toBe('');
    expect(removeSpecialSequences('%?')).toBe('');
    expect(removeSpecialSequences('*~')).toBe('');
    expect(removeSpecialSequences('!!')).toBe('');
    expect(removeSpecialSequences('#&')).toBe('');
  });

  test('removes multiple occurrences in a single pass', () => {
    expect(removeSpecialSequences('a@$b^^c~@d%?e*~f!!g#&h')).toBe('abcdefgh');
  });

  test('leaves normal content untouched', () => {
    expect(removeSpecialSequences('hello world')).toBe('hello world');
  });

  test('handles empty string', () => {
    expect(removeSpecialSequences('')).toBe('');
  });

  test('removes sequences that appear at boundaries', () => {
    expect(removeSpecialSequences('@$hello#&')).toBe('hello');
  });
});

describe('shiftString', () => {
  test('shifts each character code down by 3', () => {
    // 'd'=100, 'e'=101, 'f'=102 → 'a'=97, 'b'=98, 'c'=99
    expect(shiftString('def')).toBe('abc');
  });

  test('handles empty string', () => {
    expect(shiftString('')).toBe('');
  });

  test('shifts all chars consistently', () => {
    const input = 'Hello';
    const result = shiftString(input);
    for (let i = 0; i < input.length; i++) {
      expect(result.charCodeAt(i)).toBe(input.charCodeAt(i) - 3);
    }
  });
});
