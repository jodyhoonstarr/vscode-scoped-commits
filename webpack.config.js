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
      // workspace config. The patches below:
      //
      // 1. rewrite `require(...)` sites to `__non_webpack_require__` so plain
      //    CommonJS runtime resolution happens against the user's real
      //    node_modules; and
      // 2. rewrite dynamic `import(...)` sites to a Function-wrapped runtime
      //    import helper so webpack does not statically bundle user workspace
      //    modules, while preserving ESM semantics for `file://...` URLs.
      //
      // That second point matters for issue #401: commitlint resolves extended
      // configs/plugins to absolute paths and then converts those paths to
      // `file://...` URLs before importing them. `import(fileUrl)` works, but
      // `require(fileUrl)` does not, so routing those imports through
      // __non_webpack_require__ breaks Windows (and any other runtime that
      // receives a file URL).
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
                'const imported = await new Function("id", "return import(id)")(path.isAbsolute(id) ? pathToFileURL(id).toString() : id);',
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
                'const imported = await new Function("id", "return import(id)")(path.isAbsolute(id) ? pathToFileURL(id).toString() : id);',
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
      // dynamically loads commitlint config files via `await import(href)` where
      // href is a runtime file:// URL pointing to the user's workspace config.
      // Webpack cannot statically resolve this, so we redirect it to
      // __non_webpack_require__ so Node resolves it at runtime.
      // typescript is a workspace dep that must also resolve at runtime.
      // parse-json, js-yaml, and import-fresh are cosmiconfig's own bundled deps
      // and must NOT be redirected — webpack bundles them normally.
      {
        enforce: 'pre',
        test: /cosmiconfig[\/\\]dist[\/\\]loaders\.js/,
        loader: 'string-replace-loader',
        options: {
          multiple: [
            {
              search: 'return (await import(href)).default;',
              replace:
                'return (await new Function("id", "return import(id)")(href)).default;',
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
      // jiti/lib/jiti.mjs is the ESM entry used by cosmiconfig-typescript-loader
      // (imported as `import { createJiti } from "jiti"`). Two patches are needed:
      // 1. `import { createRequire } from "node:module"` — webpack drops this
      //    harmony import when bundling to CJS, leaving createRequire undefined.
      //    Replace with a CJS-style __non_webpack_require__ call.
      // 2. `const nativeImport = (id) => import(id)` — webpack cannot statically
      //    resolve the dynamic import argument; redirect to __non_webpack_require__.
      {
        enforce: 'pre',
        test: /jiti[\/\\]lib[\/\\]jiti\.mjs/,
        loader: 'string-replace-loader',
        options: {
          multiple: [
            {
              search: 'import { createRequire } from "node:module";',
              replace:
                'const { createRequire } = __non_webpack_require__("node:module");',
              strict: true,
            },
            {
              search: 'const nativeImport = (id) => import(id);',
              replace:
                'const nativeImport = (id) => __non_webpack_require__(id);',
              strict: true,
            },
          ],
        },
      },
      // jiti/lib/jiti.cjs is the CJS entry reached via
      // cosmiconfig-typescript-loader → require("jiti"). It calls
      // require("node:module") to obtain createRequire, but node:module is not
      // externalized in webpack, so it would be bundled as an empty stub and
      // createRequire would be undefined at runtime. Rewrite the call to
      // __non_webpack_require__ so Node resolves the real built-in at runtime.
      {
        enforce: 'pre',
        test: /jiti[\/\\]lib[\/\\]jiti\.cjs/,
        loader: 'string-replace-loader',
        options: {
          search: 'const { createRequire } = require("node:module");',
          replace:
            'const { createRequire } = __non_webpack_require__("node:module");',
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
