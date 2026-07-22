// Consumer smoke test for electron-windows-msix.
//
// This script is meant to run from a throwaway project OUTSIDE the repo, where the
// module has been installed via `npm install electron-windows-msix-<version>.tgz`
// against the public npm registry. That mirrors a real consumer exactly:
//   - `electron-windows-msix` is loaded from its published tarball (lib/ + static/),
//   - `@microsoft/winappcli` resolves as an optionalDependency from public npm, and
//   - winappcli self-acquires the SDK build tools (makeappx/makepri) at runtime.
//
// It packages + signs the fixture app and asserts the MSIX is produced. Installing,
// launching, and uninstalling the result is handled by the workflow that runs this.
//
// Inputs (environment variables):
//   FIXTURES - absolute path to test/e2e/fixtures in the checked-out repo
//   OUT_DIR  - absolute path to write the packaged MSIX into

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { packageMSIX } = require('electron-windows-msix');

const fixtures = process.env.FIXTURES;
const outputDir = process.env.OUT_DIR;

if (!fixtures || !outputDir) {
  throw new Error('FIXTURES and OUT_DIR environment variables are required');
}

const expectedMsix = path.join(outputDir, 'hellomsix_x64.msix');

const main = async () => {
  console.log(`electron-windows-msix: ${require.resolve('electron-windows-msix')}`);
  console.log(`@microsoft/winappcli:  ${require.resolve('@microsoft/winappcli')}`);
  console.log(`Packaging fixture app from ${fixtures} into ${outputDir}`);

  // Intentionally mirrors test/e2e/installation.spec.ts, including omitting
  // packageAssets so the default assets shipped inside the tarball (static/assets)
  // are exercised — this proves the published package is self-contained.
  await packageMSIX({
    appDir: path.join(fixtures, 'app-x64'),
    outputDir,
    appManifest: path.join(fixtures, 'AppxManifest_x64.xml'),
    windowsSignOptions: {
      files: [expectedMsix],
      certificateFile: path.join(fixtures, 'MSIXDevCert.pfx'),
      certificatePassword: 'Password123',
    },
  });

  if (!existsSync(expectedMsix)) {
    throw new Error(`Expected MSIX was not produced at ${expectedMsix}`);
  }

  console.log(`OK: produced signed MSIX at ${expectedMsix}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
