// Gravador de .zip mínimo (processo principal): deflate do zlib, CRC32, nomes em UTF-8.
// shortcut: sem ZIP64 — cada arquivo e o .zip inteiro precisam ficar abaixo de 4 GB; trocar por uma
// biblioteca (ex.: yazl) se algum cofre chegar perto disso.
const fs = require('fs');
const zlib = require('zlib');

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// entries: [{ name: 'pasta/nota.md', data: Buffer | read: () => Promise<Buffer>, mtime: Date }] → grava o .zip em outPath (atômico)
async function writeZip(outPath, entries) {
  const tmp = outPath + '.part';
  const out = fs.createWriteStream(tmp);
  const write = (b) => new Promise((res, rej) => out.write(b, (e) => (e ? rej(e) : res())));
  const central = [];
  let offset = 0;
  try {
    for (const e of entries) {
      const name = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8');
      const raw = e.data ?? await e.read(), comp = zlib.deflateRawSync(raw, { level: 6 }); // lido só agora: o cofre não fica todo na memória
      const { time, date } = dosTime(e.mtime || new Date());
      const crc = crc32(raw);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); // UTF-8
      local.writeUInt16LE(8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(raw.length, 22);
      local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
      await write(local); await write(name); await write(comp);
      central.push({ name, crc, csize: comp.length, size: raw.length, time, date, offset });
      offset += 30 + name.length + comp.length;
      if (offset > 0xffffffff) throw new Error('Cofre grande demais para o backup .zip (limite de 4 GB)');
    }
    let cdSize = 0;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8);
      h.writeUInt16LE(8, 10); h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14);
      h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.size, 24);
      h.writeUInt16LE(c.name.length, 28); h.writeUInt32LE(c.offset, 42);
      await write(h); await write(c.name);
      cdSize += 46 + c.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
    await write(end);
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    await fs.promises.rename(tmp, outPath);
  } catch (err) {
    out.destroy();
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  return { files: entries.length, bytes: offset };
}

module.exports = { writeZip, crc32 };
