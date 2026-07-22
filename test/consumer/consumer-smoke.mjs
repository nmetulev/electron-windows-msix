// Consumer smoke test for electron-windows-msix.
//
// This script is meant to run from a throwaway project OUTSIDE the repo, where the
// module has been installed via `npm install electron-windows-msix-<version>.tgz`
// against the public npm registry. That mirrors a real consumer exactly:
//   - `electron-windows-msix` is loaded from its published tarball (lib/ + static/),
//   - `@microsoft/winappcli` resolves as an optionalDependency from public npm, and
//   - winappcli self-acquires the SDK build tools (makeappx/makepri) at runtime.
//
// It packages + signs an app and asserts the MSIX is produced. Installing, launching,
// and uninstalling the result is handled by the workflow that runs this.
//
// Inputs (environment variables):
//   FIXTURES     - absolute path to test/e2e/fixtures in the checked-out repo (for the cert)
//   OUT_DIR      - absolute path to write the packaged MSIX into
//   APP_DIR      - app payload folder to package (default: the lightweight stub app-x64)
//   APP_MANIFEST - AppxManifest to use (default: the stub AppxManifest_x64.xml)
//
// The Electron end-to-end job overrides APP_DIR/APP_MANIFEST to package a real Electron app.

import { createRequire } from 'node:module';
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { packageMSIX } = require('electron-windows-msix');

const fixtures = process.env.FIXTURES;
const outputDir = process.env.OUT_DIR;

if (!fixtures || !outputDir) {
  throw new Error('FIXTURES and OUT_DIR environment variables are required');
}

const appDir = process.env.APP_DIR || path.join(fixtures, 'app-x64');
const appManifest = process.env.APP_MANIFEST || path.join(fixtures, 'AppxManifest_x64.xml');

const main = async () => {
  console.log(`electron-windows-msix: ${require.resolve('electron-windows-msix')}`);
  console.log(`@microsoft/winappcli:  ${require.resolve('@microsoft/winappcli')}`);
  console.log(`Packaging ${appDir}`);
  console.log(`Using manifest ${appManifest} -> ${outputDir}`);

  // Intentionally omits packageAssets so the default assets shipped inside the tarball
  // (static/assets) are exercised — this proves the published package is self-contained.
  // Intentionally omits windowsSignOptions.files so the library signs whatever MSIX it
  // produces (name-agnostic), which keeps this script reusable across fixtures.
  const { msixPackage } = await packageMSIX({
    appDir,
    outputDir,
    appManifest,
    windowsSignOptions: {
      certificateFile: path.join(fixtures, 'MSIXDevCert.pfx'),
      certificatePassword: 'Password123',
    },
  });

  if (!msixPackage || !existsSync(msixPackage)) {
    throw new Error(`Expected MSIX was not produced (got ${msixPackage})`);
  }

  console.log(`OK: produced signed MSIX at ${msixPackage}`);

  // Hand the produced path back to the workflow so it can install/launch/uninstall it.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `msix=${msixPackage}\n`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
