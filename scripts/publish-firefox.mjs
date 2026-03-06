import fs from 'node:fs';
import path from 'node:path';

const artifact = path.join(process.cwd(), '.output', 'video-downloader-unshackle-firefox.zip');

if (!fs.existsSync(artifact)) {
  console.error('publish-firefox: missing Firefox zip. Run npm run zip:firefox first.');
  process.exit(1);
}

if (!process.env.AMO_JWT_ISSUER || !process.env.AMO_JWT_SECRET) {
  console.error('publish-firefox: AMO_JWT_ISSUER and AMO_JWT_SECRET are required.');
  process.exit(1);
}

console.log('publish-firefox: Firefox artifact and AMO credentials are present.');
console.log('publish-firefox: upload is intentionally manual until AMO signing is configured.');
