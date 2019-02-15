const {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} = require('fs');
const path = require('path');

const defaultConfig = {
  bypass: false,
  allowed: [
    'html',
    'css',
    'js',
    'woff2',
    'svg',
    'ico',
    'png',
    'webmanifest',
  ],
  additional: [],
};

/**
 * Flatten the bundle structure to array of strings
 * @param bundle
 * @param result
 * @returns {*[]}
 */
const getAssets = (bundle, result = []) => {
  result.push(bundle.name);
  if (bundle.entryAsset) {
    result.concat(
      ...Array.from(bundle.entryAsset.parentBundle.childBundles)
        .map(a => getAssets(a, result)),
    );
    return result;
  }
  return result;
};

/**
 * Create a service worker and inject in resulting html page
 * @param bundle
 * @param outDir
 * @returns {Promise<void>}
 */
const createServiceWorker = async (bundle, outDir) => {
  const pkg = await bundle.entryAsset.getPackage();
  const config = {
    ...defaultConfig,
    ...(pkg.precachingSW || {}),
  };

  if (config.bypass === true) {
    if (existsSync(config.path)) {
      unlinkSync(config.path);
    }
    return;
  }

  const assets = getAssets(bundle).filter((name) => {
    const ext = name.split('.').pop();
    return config.allowed.includes(ext);
  }).map(name => name.replace(outDir, ''));

  if (config.additional && config.additional.length > 0) {
    assets.push(...config.additional);
  }
  const cache = JSON.stringify(assets);
  const cacheName = `${pkg.name}-${bundle.entryAsset.hash.substr(0, 8)}`;

  const templatePath = path.resolve(__dirname, './sw.template.js');
  const template = readFileSync(templatePath, 'utf8');

  const sw = template
    .replace('%{caches}', cache)
    .replace('%{cacheName}', cacheName);

  if (bundle.entryAsset.basename === 'index.html') {
    const registerSW = 'if (\'serviceWorker\' in navigator) { navigator.serviceWorker.register(\'/sw.js\'); }';
    const file = `${outDir}/index.html`;
    const fileContents = readFileSync(file);
    const html = fileContents.toString().replace('</body>', `<script>${registerSW}</script></body>`);
    writeFileSync(file, html);
  }

  writeFileSync(`${outDir}/sw.js`, sw);
};

module.exports = (bundler) => {
  if (process.env.NODE_ENV === 'production') {
    const { outDir } = bundler.options;
    bundler.on('bundled', async (bundle) => {
      if (bundle.entryAsset === null && bundle.childBundles) {
        bundle.childBundles.forEach((b) => {
          createServiceWorker(b, outDir);
        });
      } else {
        createServiceWorker(bundle, outDir);
      }
    });
  }
};
