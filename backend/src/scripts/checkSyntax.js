import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';


const roots = ['src', 'test', 'test-support'];

const listJavaScript = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJavaScript(fullPath));
    }
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
};


const files = (await Promise.all(roots.map(listJavaScript))).flat().sort();
const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failures.push(file);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${JSON.stringify({
    event: 'syntax_check_failed',
    files: failures,
  })}\n`);
  process.exitCode = 1;
}
else {
  process.stdout.write(`${JSON.stringify({
    event: 'syntax_check_completed',
    filesChecked: files.length,
  })}\n`);
}
