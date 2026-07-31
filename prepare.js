'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const SOURCE_URL =
  'https://raw.githubusercontent.com/carloscuesta/gitmoji/v3.13.1/packages/gitmojis/src/gitmojis.json';
const EXPECTED_SHA256 =
  '7a136044a516f3572c8b28f78dea4ff2b6979ce32b934106e393c8f913cf2580';
const MAX_DOWNLOAD_BYTES = 1024 * 1024;
const destination = path.resolve(__dirname, 'src/vendors/gitmojis.json');

function download(url) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'vscode-scoped-commits-build',
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          fail(new Error(`Download failed with HTTP status ${statusCode}.`));
          return;
        }

        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_DOWNLOAD_BYTES) {
            fail(new Error('Downloaded gitmoji data exceeds the size limit.'));
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (!settled) {
            settled = true;
            resolve(Buffer.concat(chunks));
          }
        });
        response.on('error', fail);
      },
    );

    request.on('error', fail);
  });
}

async function main() {
  const content = await download(SOURCE_URL);
  const actualSha256 = crypto
    .createHash('sha256')
    .update(content)
    .digest('hex');

  if (actualSha256 !== EXPECTED_SHA256) {
    throw new Error(
      `Checksum mismatch for gitmoji data: expected ${EXPECTED_SHA256}, got ${actualSha256}.`,
    );
  }

  const temporaryDestination = `${destination}.${process.pid}.${Date.now()}.tmp`;
  let temporaryFileCreated = false;
  try {
    fs.writeFileSync(temporaryDestination, content, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    temporaryFileCreated = true;
    if (process.platform === 'win32') {
      fs.rmSync(destination, { force: true });
    }
    fs.renameSync(temporaryDestination, destination);
    temporaryFileCreated = false;
  } finally {
    if (temporaryFileCreated) {
      fs.rmSync(temporaryDestination, { force: true });
    }
  }
}

main().catch((error) => {
  console.error(`Failed to prepare gitmoji data: ${error.message}`);
  process.exitCode = 1;
});
