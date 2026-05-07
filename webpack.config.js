'use strict';

const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const WarningsToErrorsPlugin = require('warnings-to-errors-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
  node: {
    __dirname: false,
    __filename: false,
  },
  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js'],
  },
  module: {
    parser: {
      javascript: {
        commonjsMagicComments: true,
      },
    },
    rules: [
      // @commitlint/load v20+ is shipped as ESM and uses
      // `const require = createRequire(import.meta.url)` to obtain a real Node
      // require. Webpack still tries to statically follow the resulting
      // `require(...)` / `require.resolve(...)` / dynamic `import(...)` call
      // sites — that is "correct" by webpack's contract but wrong for our
      // bundle, where the path is determined at runtime by the user's
      // workspace config. The patches below rewrite those call sites to
      // `__non_webpack_require__` (webpack's escape hatch that emits a real
      // Node require) so resolution happens against the user's actual
      // node_modules at runtime.
      {
        enforce: 'pre',
        test: /@commitlint[\/\\]load[\/\\]lib[\/\\]utils[\/\\]load-plugin\.js/,
        loader: 'string-replace-loader',
        options: {
          multiple: [
            {
              search: 'const require = createRequire(import.meta.url);',
              replace: '',
              strict: true,
            },
            {
              search:
                'const __dirname = path.resolve(fileURLToPath(import.meta.url), "..");',
              replace: 'const __dirname = path.resolve(__filename, "..");',
              strict: true,
            },
            {
              search:
                'const imported = await import(path.isAbsolute(id) ? pathToFileURL(id).toString() : id);',
              replace:
                'const imported = await __non_webpack_require__(path.isAbsolute(id) ? pathToFileURL(id).toString() : id);',
              strict: true,
            },
            {
              search:
                'resolvedPath = require.resolve(longName, { paths: [searchPath] });',
              replace:
                'resolvedPath = __non_webpack_require__.resolve(longName, { paths: [searchPath] });',
              strict: true,
            },
            {
              search: /resolvedPath = require\.resolve\(longName\);/g,
              replace:
                'resolvedPath = __non_webpack_require__.resolve(longName);',
              strict: true,
            },
            {
              search: 'version = require(pkgPath).version;',
              replace: 'version = __non_webpack_require__(pkgPath).version;',
              strict: true,
            },
          ],
        },
      },
      {
        enforce: 'pre',
        test: /@commitlint[\/\\]resolve-extends[\/\\]lib[\/\\]index\.js/,
        loader: 'string-replace-loader',
        options: {
          multiple: [
            {
              search: 'const require = createRequire(import.meta.url);',
              replace: '',
              strict: true,
            },
            {
              search: '        : import.meta.url);',
              replace: '        : pathToFileURL(__filename));',
              strict: true,
            },
            {
              search: 'return require(id);',
              replace: 'return __non_webpack_require__(id);',
              strict: true,
            },
            {
              search:
                'const imported = await import(path.isAbsolute(id) ? pathToFileURL(id).toString() : id);',
              replace:
                'const imported = await __non_webpack_require__(path.isAbsolute(id) ? pathToFileURL(id).toString() : id);',
              strict: true,
            },
            {
              search: 'return require.resolve(specifier, { paths: [npxDir] });',
              replace:
                'return __non_webpack_require__.resolve(specifier, { paths: [npxDir] });',
              strict: true,
            },
          ],
        },
      },
      // cosmiconfig (transitively used by @commitlint/load's loadConfig)
      // dynamically loads commitlint config files via `await import(href)` and
      // lazily requires `typescript` for `.ts` configs. Both call sites are
      // expressions webpack cannot statically resolve.
      {
        enforce: 'pre',
        test: /cosmiconfig[\/\\]dist[\/\\]loaders\.js/,
        loader: 'string-replace-loader',
        options: {
          multiple: [
            {
              search: 'return (await import(href)).default;',
              replace: 'return (await __non_webpack_require__(href)).default;',
              strict: true,
            },
            {
              search: "importFresh = require('import-fresh');",
              replace: "importFresh = __non_webpack_require__('import-fresh');",
              strict: true,
            },
            {
              search: "parseJson = require('parse-json');",
              replace: "parseJson = __non_webpack_require__('parse-json');",
              strict: true,
            },
            {
              search: "yaml = require('js-yaml');",
              replace: "yaml = __non_webpack_require__('js-yaml');",
              strict: true,
            },
            {
              search: "typescript = require('typescript');",
              replace: "typescript = __non_webpack_require__('typescript');",
              strict: true,
            },
            {
              search: "typescript = (await import('typescript')).default;",
              replace:
                "typescript = (await __non_webpack_require__('typescript')).default;",
              strict: true,
            },
          ],
        },
      },
      // import-fresh is reached transitively via cosmiconfig (used by
      // @commitlint/load's loadConfig). Same reasoning as above.
      {
        enforce: 'pre',
        test: /import-fresh[\/\\]index\.js/,
        loader: 'string-replace-loader',
        options: {
          multiple: [
            {
              search: 'const parentPath = parentModule(__filename);',
              replace: 'const parentPath = parentModule(__filename) || "";',
              strict: true,
            },
            {
              search: / require\(filePath\)/g,
              replace: ' __non_webpack_require__(filePath)',
              strict: true,
            },
          ],
        },
      },
      // jiti (transitively pulled in by cosmiconfig-typescript-loader) does a
      // dynamic `import(id)` whose argument webpack cannot resolve
      // statically. We do not actually run TypeScript-authored commitlint
      // configs through this code path in the bundle, but webpack still
      // refuses to compile until the call is opaque to its analyser.
      {
        enforce: 'pre',
        test: /jiti[\/\\]lib[\/\\]jiti\.mjs/,
        loader: 'string-replace-loader',
        options: {
          search: 'const nativeImport = (id) => import(id);',
          replace: 'const nativeImport = (id) => __non_webpack_require__(id);',
          strict: true,
        },
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                sourceMap: true,
              },
            },
          },
        ],
      },
    ],
  },
  optimization: {
    minimize: false,
  },
  plugins: [new WarningsToErrorsPlugin(), new CleanWebpackPlugin()],
};

module.exports = config;
