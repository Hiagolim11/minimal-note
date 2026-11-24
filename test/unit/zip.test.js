const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { writeZip, crc32 } = require('../../src/node/zip.js');

test('crc32 confere com o valor conhecido', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('o .zip abre no Python e no unzip, com nomes acentuados, vazio e binário', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-')), out = path.join(dir, 'b.zip');
  const bin = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 37) % 256));
  const r = await writeZip(out, [
    { name: 'Diário/Reunião ação.md', data: Buffer.from('# Ação\nçãõ 😀\n'), mtime: new Date(2026, 10, 24, 10, 30) },
    { name: 'vazia.md', data: Buffer.alloc(0) },
    { name: 'Anexos/img.bin', read: async () => bin },
  ]);
  assert.equal(r.files, 3);
  assert.ok(!fs.existsSync(out + '.part'));
  const py = spawnSync('python3', ['-c', `
import zipfile, sys, hashlib
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print(sorted(z.namelist()))
print(repr(z.read('Diário/Reunião ação.md').decode()))  # repr: uma linha só
print(hashlib.sha256(z.read('Anexos/img.bin')).hexdigest(), len(z.read('vazia.md')))
print(z.getinfo('Diário/Reunião ação.md').date_time)`, out], { encoding: 'utf8' });
  if (py.error) return; // sem Python na máquina: só o resto do teste vale
  assert.equal(py.status, 0, py.stderr);
  const lines = py.stdout.trim().split('\n');
  assert.equal(lines[0], "['Anexos/img.bin', 'Diário/Reunião ação.md', 'vazia.md']");
  assert.equal(lines[1], "'# Ação\\nçãõ 😀\\n'");
  assert.equal(lines[2], require('crypto').createHash('sha256').update(bin).digest('hex') + ' 0');
  assert.equal(lines[3], '(2026, 11, 24, 10, 30, 0)');
  const uz = spawnSync('unzip', ['-tq', out], { encoding: 'utf8' });
  if (!uz.error) assert.match(uz.stdout, /No errors detected/);
});
