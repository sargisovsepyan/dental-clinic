import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';


const repositoryRoot = path.resolve(process.cwd(), '..');
const git = spawnSync(
  'git',
  ['-c', `safe.directory=${repositoryRoot.replaceAll('\\', '/')}`, 'ls-files', '-z'],
  { cwd: repositoryRoot, encoding: 'utf8' }
);
if (git.status !== 0) {
  throw new Error('Unable to inspect tracked files');
}

const trackedFiles = git.stdout.split('\0').filter(Boolean);
const findings = [];
const secretFilePattern = /(^|\/)(\.env(?:\..+)?|[^/]+\.(?:pem|p12|pfx|key))$/i;
const allowedEnvironmentExamples = new Set(['.env.example']);
const contentPatterns = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github_token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['google_api_key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  [
    'credentialed_service_uri',
    /\b(?:mongodb(?:\+srv)?|rediss?|postgres(?:ql)?):\/\/[^\s<:/]+:[^\s<@]+@/i,
  ],
];

for (const relativePath of trackedFiles) {
  const normalized = relativePath.replaceAll('\\', '/');
  const baseName = path.posix.basename(normalized);
  if (
    secretFilePattern.test(normalized) &&
    !allowedEnvironmentExamples.has(baseName)
  ) {
    findings.push({ file: normalized, type: 'secret_file_tracked' });
    continue;
  }

  let content;
  try {
    content = await readFile(path.join(repositoryRoot, relativePath), 'utf8');
  }
  catch {
    continue;
  }
  for (const [type, pattern] of contentPatterns) {
    if (pattern.test(content)) {
      findings.push({ file: normalized, type });
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({
    event: 'tracked_secret_check_failed',
    findings,
  })}\n`);
  process.exitCode = 1;
}
else {
  process.stdout.write(`${JSON.stringify({
    event: 'tracked_secret_check_completed',
    filesChecked: trackedFiles.length,
  })}\n`);
}
