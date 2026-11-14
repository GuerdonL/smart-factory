/* Zip files, in the plainest form: enough to hand a tree of text files over as one, and to take one back.

   zip(files)   -> Uint8Array      files: [{ path, text }]; stored without compression
   unzip(bytes) -> Promise of [{ path, text }]    reads stored and deflated entries, so a zip remade by a computer's
                                                 own tools opens too; directories and non-text files come through
                                                 as they are (text decoded as UTF-8) */

const table = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function zip(files){
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  const u16 = n => [n & 0xff, (n >>> 8) & 0xff], u32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  for (const f of files){
    const name = enc.encode(f.path), data = enc.encode(f.text), crc = crc32(data);
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];      /* 0x0800: names are UTF-8 */
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...common, ...name]);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    parts.push(local, data); offset += local.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end], bytes = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of all){ bytes.set(p, at); at += p.length; }
  return bytes;
}

export async function unzip(bytes){
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder();
  let end = bytes.length - 22; while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip file');
  const count = v.getUint16(end + 10, true), files = []; let p = v.getUint32(end + 16, true);
  for (let i = 0; i < count; i++){
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('damaged zip file');
    const method = v.getUint16(p + 10, true), packed = v.getUint32(p + 20, true), nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const path = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith('/')) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true), data = bytes.subarray(start, start + packed);
    if (method === 0) files.push({ path, text: dec.decode(data) });
    else if (method === 8) files.push({ path, text: await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() });
    else throw new Error(path + ' is packed in a way this cannot read');
  }
  return files;
}
