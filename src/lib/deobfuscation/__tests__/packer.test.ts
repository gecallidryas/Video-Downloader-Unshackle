import { describe, expect, test } from 'vitest';
import { unpackDeanEdwardsPacker } from '../packer';

describe('unpackDeanEdwardsPacker', () => {
  test('returns empty string for non-packed input', () => {
    expect(unpackDeanEdwardsPacker('just plain text')).toBe('');
    expect(unpackDeanEdwardsPacker('')).toBe('');
    expect(unpackDeanEdwardsPacker('function() {}')).toBe('');
  });

  test('returns empty string for malformed match (count=0)', () => {
    // count=0 means no substitutions needed but the guard `count <= 0` returns ''
    const malformed = `eval(function(p,a,c,k,e,d){e=function(c){return c};if(!''.replace(/^/,String)){while(c--){d[c]=k[c]||c}k=[function(e){return d[e]}];e=function(){return'\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c])}};return p}('hello world',62,0,''.split('|'),0,{}))`;
    expect(unpackDeanEdwardsPacker(malformed)).toBe('');
  });

  test('unpacks a simple script with one substitution', () => {
    // Packed: p='0 world', a=62, c=1, k=['hello'] → replaces '0' with 'hello'
    const packed = `eval(function(p,a,c,k,e,d){e=function(c){return c};if(!''.replace(/^/,String)){while(c--){d[c]=k[c]||c}k=[function(e){return d[e]}];e=function(){return'\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c])}};return p}('0 world',62,1,'hello'.split('|'),0,{}))`;
    const result = unpackDeanEdwardsPacker(packed);
    expect(result).toBe('hello world');
  });

  test('unpacks a packer script with multiple symbol substitutions', () => {
    // Packed: '0 1:"2"', a=62, c=3, k=['file', 'src', 'https://cdn.example.com/v.m3u8']
    // Word '0' → 'file', '1' → 'src', '2' → 'https://cdn.example.com/v.m3u8'
    const packed = `eval(function(p,a,c,k,e,d){e=function(c){return c};if(!''.replace(/^/,String)){while(c--){d[c]=k[c]||c}k=[function(e){return d[e]}];e=function(){return'\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c])}};return p}('0 1:"2"',62,3,'file|src|https://cdn.example.com/v.m3u8'.split('|'),0,{}))`;
    const result = unpackDeanEdwardsPacker(packed);
    expect(result).toContain('file');
    expect(result).toContain('src');
    expect(result).toContain('https://cdn.example.com/v.m3u8');
  });

  test('handles escaped characters in packed string', () => {
    // Packed code contains \' which should become '
    const packed = `eval(function(p,a,c,k,e,d){e=function(c){return c};if(!''.replace(/^/,String)){while(c--){d[c]=k[c]||c}k=[function(e){return d[e]}];e=function(){return'\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c])}};return p}('0 it\\'s here',62,1,'hello'.split('|'),0,{}))`;
    const result = unpackDeanEdwardsPacker(packed);
    expect(result).toContain("hello it's here");
  });

  test('uses alternate variable name "r" in function signature', () => {
    // Some packers use (p,a,c,k,e,r) instead of (p,a,c,k,e,d)
    const packed = `eval(function(p,a,c,k,e,r){e=function(c){return c};if(!''.replace(/^/,String)){while(c--){r[c]=k[c]||c}k=[function(e){return r[e]}];e=function(){return'\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c])}};return p}('0 world',62,1,'hello'.split('|'),0,{}))`;
    const result = unpackDeanEdwardsPacker(packed);
    expect(result).toBe('hello world');
  });
});
