import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';

import { log } from './logger';
import { manifest } from './manifestation';
import { getCertPublisher } from './bin';
import { ManifestVariables, PackagingOptions, ProgramOptions, WindowsSignOptions } from './types';
import { isValidVersion } from './win-version';

export const removeFileExtension = (executablePath: string) => {
  if (!executablePath) return undefined;
  const executable = path.basename(executablePath);
  return executable.replace(/\.[^/.]+$/, '');
};

export const removePublisherPrefix = (publisher: string) => {
  return publisher.replace(/^CN=/, '');
};

export const ensurePublisherPrefix = (publisher: string) => {
  return !publisher || publisher.startsWith('CN=') ? publisher : `CN=${publisher}`;
};

export const ensureFolders = async (options: PackagingOptions) => {
  const outputDir = options.outputDir;
  const layoutDir = path.join(options.outputDir, 'msix_layout');

  if (await fs.exists(outputDir)) {
    log.debug('Output dir already exists. Making sure its empty.', { outputDir });
    await fs.emptyDir(outputDir);
  } else {
    log.debug('Output dir does not exists. Creating it.');
    await fs.ensureDir(outputDir);
  }

  log.debug('Creating layout dir', { layoutDir });
  await fs.ensureDir(layoutDir);

  return { outputDir, layoutDir };
};

export const verifyOptions = async (
  options: PackagingOptions,
  manifestVars?: ManifestVariables,
) => {
  const { manifestIsSparsePackage, manifestPublisher } = manifestVars || {};
  const publisher =
    manifestPublisher || ensurePublisherPrefix(options.manifestVariables?.publisher);
  const windowsSignOptions = options.windowsSignOptions;
  const sign = options.sign !== undefined ? options.sign : true;

  let hasManifestParams = false;
  log.debug('You are calling with following packaging options', options);
  if (!options.appManifest && options.manifestVariables) {
    if (!options.manifestVariables.packageVersion)
      log.error(
        'Neither package version <packageVersion> nor app manifest <appManifest> provided.',
        true,
      );
    if (!isValidVersion(options.manifestVariables.packageVersion))
      log.error('Package version <packageVersion> is not a semantic version.', true, {
        packageVersion: options.manifestVariables.packageVersion,
      });
    if (!options.manifestVariables.publisher)
      log.error('Neither publisher <publisher> nor app manifest <appManifest> provided.', true);
    if (!options.manifestVariables.publisherDisplayName)
      log.warn(
        'Neither publisher display name <publisherDisplayName> nor app manifest <appManifest> provided. Using publisher as display name.',
      );
    if (!options.manifestVariables.packageDisplayName)
      log.warn(
        'Neither package display name <packageDisplayName> nor app manifest <appManifest> provided. Using app executable as display name.',
      );
    if (!options.manifestVariables.appExecutable)
      log.error(
        'Neither app executable <appExecutable> nor app manifest <appManifest> provided.',
        true,
      );
    if (!options.manifestVariables.targetArch)
      log.error(
        'Neither target architecture <targetArch> nor app manifest <appManifest> provided.',
        true,
      );
    if (!options.manifestVariables.packageMinOSVersion)
      log.warn(
        'Neither package min OS version <packageMinOSVersion> nor app manifest <appManifest> provided. Using default OS version 10.0.19041.0.',
      );
    if (!options.manifestVariables.packageMaxOSVersionTested)
      log.warn(
        'Neither package max OS version tested <packageMaxOSVersionTested> nor app manifest <appManifest> provided. Using default OS version 10.0.19041.0.',
      );
    if (!options.manifestVariables.packageIdentity)
      log.error(
        'Neither package identity <packageIdentity> nor app manifest <appManifest> provided.',
        true,
      );
    if (!options.manifestVariables.appDisplayName)
      log.warn(
        'Neither app display name <appDisplayName> nor app manifest <appManifest> provided. Using app executable as display name.',
      );
    if (!options.manifestVariables.packageDescription)
      log.warn(
        'Neither package description <packageDescription> nor app manifest <appManifest> provided. Using app executable as description.',
      );
    if (!options.manifestVariables.packageBackgroundColor)
      log.warn(
        'Neither package background color <packageBackgroundColor> nor app manifest <appManifest> provided. Using default background color transparent.',
      );
    const cta = options.manifestVariables.comToastActivation;
    if (cta?.toastActivatorClsid) {
      const guid = cta.toastActivatorClsid.trim().replace(/^\{|\}$/g, '');
      const guidOk =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(guid);
      if (!guidOk) {
        log.error('comToastActivation.toastActivatorClsid must be a valid GUID.', true, {
          toastActivatorClsid: cta.toastActivatorClsid,
        });
      }
    }
    hasManifestParams = true;
  }
  if (!hasManifestParams && !options.appManifest)
    log.error(
      'Neither app manifest <appManifest> nor manifest variables <manifestVariables> provided.',
      true,
    );
  if (options.appManifest && !(await fs.exists(options.appManifest)))
    log.error('Path to application manifest <appManifest> does not exist.', true, {
      appManifest: options.appManifest,
    });
  if (!options.appDir && !manifestIsSparsePackage)
    log.error('Path to application <appDir> not provided.', true);
  if (!(await fs.exists(options.appDir)) && !manifestIsSparsePackage)
    log.error('Path to application <appDir> does not exist.', true, { appDir: options.appDir });
  if (!options.packageAssets)
    log.warn('Path to packages assets <packageAssets> not provided, using default assets.');
  if (options.packageAssets && !(await fs.exists(options.packageAssets)))
    log.error('Path to packages assets provided but <packageAssets> does not exist.', true, {
      packageAssets: options.packageAssets,
    });
  if (sign) {
    if (
      !windowsSignOptions ||
      (!windowsSignOptions['appDirectory'] &&
        (!windowsSignOptions['files'] || windowsSignOptions['files'].length === 0))
    ) {
      log.warn(
        'Neither path to application <appDir> nor files <files> provided in windows sign options. Will add MSIX package to files.',
      );
    }

    if (
      !windowsSignOptions?.certificateFile &&
      !process.env.WINDOWS_CERTIFICATE_FILE &&
      (windowsSignOptions?.certificatePassword || process.env.WINDOWS_CERTIFICATE_PASSWORD)
    )
      log.warn(
        'Path to cert <certificateFile> or environment variable WINDOWS_CERTIFICATE_FILE not provided. A dev cert will be created with the provided password and the package will be signed with it!',
      );
    if (
      !windowsSignOptions?.certificateFile &&
      !windowsSignOptions?.certificatePassword &&
      !process.env.WINDOWS_CERTIFICATE_PASSWORD
    )
      log.warn(
        'Path to cert <certificateFile> and cert password <certificatePassword> or environment variable WINDOWS_CERTIFICATE_PASSWORD not provided. A dev cert will be created with a random password and the package will be signed with it!',
      );
    if (
      windowsSignOptions?.certificateFile &&
      !(await fs.exists(windowsSignOptions?.certificateFile))
    )
      log.error('Path to cert <certificateFile> does not exist.', true, {
        certificateFile: windowsSignOptions?.certificateFile,
      });
    if (
      windowsSignOptions?.certificateFile &&
      !windowsSignOptions?.certificatePassword &&
      !process.env.WINDOWS_CERTIFICATE_PASSWORD
    )
      log.warn('Cert password <certificatePassword> not provided.');
    if (windowsSignOptions?.certificateFile && windowsSignOptions?.certificatePassword) {
      const certPublisher = await getCertPublisher(
        windowsSignOptions?.certificateFile,
        windowsSignOptions?.certificatePassword,
      );
      if (publisher != certPublisher)
        log.error('The publisher in the manifest must match the publisher of the cert', false, {
          manifest_publisher: publisher,
          cert_publisher: certPublisher,
        });
    }
  }
};

export const setLogLevel = (options: PackagingOptions) => {
  const { logLevel } = options;
  globalThis.SHOW_WARNINGS = logLevel === 'warn';
  globalThis.DEBUG = logLevel === 'debug';
};

/**
 * Generates a secure random password.
 * @returns {string} - Generated password.
 */
function generatePassword() {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const symbols = '!@#%^&*()-_=+[]{}<>?,.';
  const fullCharset = charset + symbols;
  const length = 16;
  let password = '';
  const bytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += fullCharset[bytes[i] % fullCharset.length];
  }

  return password;
}

export const makeProgramOptions = async (
  options: PackagingOptions,
  manifestVars?: ManifestVariables,
) => {
  const { outputDir, layoutDir } = await ensureFolders(options);
  const { manifestAppName, manifestPackageArch, manifestIsSparsePackage, manifestPublisher } =
    manifestVars || {};
  const appName =
    manifestAppName || removeFileExtension(options.manifestVariables?.appExecutable) || 'app';
  const packageArch = manifestPackageArch || options.manifestVariables?.targetArch;
  const isSparsePackage = manifestIsSparsePackage || false;
  const msixPackageName =
    options.packageName || (packageArch ? `${appName}_${packageArch}.msix` : `${appName}.msix`);
  const msix = path.join(outputDir, msixPackageName);
  const appManifestLayout = path.join(layoutDir, `AppxManifest.xml`);
  const assetsLayout = path.join(layoutDir, `assets`);
  const appLayout = path.join(layoutDir, `app`);
  const priConfig = path.join(layoutDir, 'priconfig.xml');
  const priFile = path.join(layoutDir, 'resources.pri');
  const createPri = options.createPri !== undefined ? options.createPri : true;
  const compress = options.compress !== undefined ? options.compress : true;
  const publisher = options.manifestVariables?.publisher || manifestPublisher || '';
  const sign = options.sign !== undefined ? options.sign : true;
  let windowsSignOptions: WindowsSignOptions;
  let cert_pfx = windowsSignOptions?.certificateFile || '';
  let cert_cer = '';
  let cert_pass = '';

  const createDevCert =
    sign && !options.windowsSignOptions && !process.env.WINDOWS_CERTIFICATE_FILE;
  if (sign) {
    windowsSignOptions = options.windowsSignOptions || {
      files: [msix],
      certificateFile: '',
      certificatePassword: '',
      hashes: ['sha256'] as any,
    };
    cert_pass =
      windowsSignOptions?.certificatePassword ||
      process.env.WINDOWS_CERTIFICATE_PASSWORD ||
      generatePassword();
    if (!windowsSignOptions.hashes || windowsSignOptions.hashes.length === 0) {
      windowsSignOptions.hashes = ['sha256'] as any;
    }
    if (createDevCert) {
      cert_pfx = path.join(outputDir, 'dev_cert.pfx');
      cert_cer = path.join(outputDir, 'dev_cert.cer');
      windowsSignOptions[`certificateFile`] = cert_pfx;
      windowsSignOptions[`certificatePassword`] = cert_pass;
    }
    if (options.logLevel === 'debug') {
      windowsSignOptions[`debug`] = true;
    }

    const hasAppDirectorySet =
      'appDirectory' in windowsSignOptions && windowsSignOptions.appDirectory;
    const hasFilesSet =
      'files' in windowsSignOptions &&
      windowsSignOptions.files &&
      windowsSignOptions.files.length > 0;
    if (!hasAppDirectorySet && !hasFilesSet) {
      windowsSignOptions[`files`] = [msix];
    }
  }

  const appManifestIn = await manifest(options);

  const program: ProgramOptions = {
    outputDir,
    layoutDir,
    msix,
    appDir: options.appDir,
    appLayout,
    appManifestIn,
    appManifestLayout,
    assetsIn: options.packageAssets || path.join(__dirname, '..', 'static', 'assets'),
    assetsLayout,
    cert_pfx,
    cert_cer,
    cert_pass: cert_pass || '',
    priConfig,
    priFile,
    createPri,
    isSparsePackage,
    compress,
    makeAppxParams: options.makeAppxParams,
    sign,
    windowsSignOptions,
    createDevCert,
    publisher,
  };

  log.debug('Program options', program);
  return program;
};

export const createLayout = async (program: ProgramOptions) => {
  await fs.writeFile(program.appManifestLayout, program.appManifestIn);
  await fs.copy(program.assetsIn, program.assetsLayout);
  if (!program.isSparsePackage) {
    await fs.copy(program.appDir, program.appLayout);
  }
};
