/* eslint-disable global-require */
const jasmineSeedReporter = require('./test/seed-reporter.cjs');
const commonjs = require('@rollup/plugin-commonjs');
const istanbul = require('rollup-plugin-istanbul');
const json = require('@rollup/plugin-json');
const resolve = require('@rollup/plugin-node-resolve').default;
const yargs = require('yargs');

module.exports = async function(karma) {
  const builds = (await import('./rollup.config.js')).default;

  const args = yargs
    .option('verbose', {default: false})
    .argv;

  const grep = (args.grep === true || args.grep === undefined) ? '' : args.grep;
  const specPattern = 'test/specs/**/*' + grep + '*.js';

  // Use the same rollup config as our dist files: when debugging (npm run dev),
  // we will prefer the unminified build which is easier to browse and works
  // better with source mapping. In other cases, pick the minified build to
  // make sure that the minification process (terser) doesn't break anything.
  const regex = /chart\.umd(\.min)?\.js$/;
  const build = builds.filter(v => v.output.file && v.output.file.match(regex))[0];

  if (karma.autoWatch) {
    build.plugins.pop();
  }

  if (args.coverage) {
    build.plugins.push(
      istanbul({exclude: ['node_modules/**/*.js', 'package.json']})
    );
  }

  // workaround a karma bug where it doesn't resolve dependencies correctly in
  // the same way that Node does
  // https://github.com/pnpm/pnpm/issues/720#issuecomment-954120387
  const plugins = Object.keys(require('./package').devDependencies).flatMap(
    (packageName) => {
      if (!packageName.startsWith('karma-')) {
        return [];
      }
      return [require(packageName)];
    }
  );

  plugins.push(jasmineSeedReporter);

  karma.set({
    frameworks: ['jasmine'],
    plugins,
    reporters: ['spec', 'kjhtml', 'jasmine-seed'],
    browsers: (args.browsers || 'chrome,firefox').split(','),
    logLevel: karma.LOG_INFO,

    client: {
      jasmine: {
        stopOnSpecFailure: !!karma.autoWatch
      }
    },

    specReporter: {
      // maxLogLines: 5,             // limit number of lines logged per test
      suppressErrorSummary: true, // do not print error summary
      suppressFailed: false,      // do not print information about failed tests
      suppressPassed: true,      // do not print information about passed tests
      suppressSkipped: false,      // do not print information about skipped tests
      showSpecTiming: false,      // print the time elapsed for each spec
      failFast: false              // test would finish with error when a first fail occurs.
    },

    // Explicitly disable hardware acceleration to make image
    // diff more stable when ran on Travis and dev machine.
    // https://github.com/chartjs/Chart.js/pull/5629
    // Since FF 110 https://github.com/chartjs/Chart.js/issues/11164
    customLaunchers: {
      chrome: {
        base: 'Chrome',
        flags: [
          '--disable-accelerated-2d-canvas',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      },
      firefox: {
        base: 'Firefox',
        prefs: {
          'layers.acceleration.disabled': true,
          'gfx.canvas.accelerated': false
        }
      },
      safari: {
        base: 'SafariPrivate'
      },
      edge: {
        base: 'Edge'
      }
    },

    files: [
      {pattern: 'test/fixtures/**/*.js', included: false},
      {pattern: 'test/fixtures/**/*.json', included: false},
      {pattern: 'test/fixtures/**/*.png', included: false},
      'node_modules/moment/min/moment.min.js',
      'node_modules/moment-timezone/builds/moment-timezone-with-data.min.js',
      {pattern: 'test/index.js', watched: false},
      {pattern: 'test/BasicChartWebWorker.js', included: false},
      {pattern: 'src/index.umd.ts', watched: false},
      'node_modules/chartjs-adapter-moment/dist/chartjs-adapter-moment.js',
      {pattern: specPattern}
    ],

    preprocessors: {
      'test/index.js': ['rollup'],
      'src/index.umd.ts': ['sources']
    },

    rollupPreprocessor: {
      plugins: [
        json(),
        resolve(),
        commonjs({exclude: ['src/**', 'test/**']}),
      ],
      output: {
        name: 'test',
        format: 'umd',
        sourcemap: karma.autoWatch ? 'inline' : false
      }
    },

    customPreprocessors: {
      sources: {
        base: 'rollup',
        options: build
      }
    },

    // These settings deal with browser disconnects. We had seen test flakiness from Firefox
    // [Firefox 56.0.0 (Linux 0.0.0)]: Disconnected (1 times), because no message in 10000 ms.
    // https://github.com/jasmine/jasmine/issues/1327#issuecomment-332939551
    browserDisconnectTolerance: 3
  });

  if (args.coverage) {
    karma.reporters.push('coverage');
    karma.coverageReporter = {
      dir: 'coverage/',
      reporters: [
        {type: 'html', subdir: 'html'},
        {type: 'lcovonly', subdir: (browser) => browser.toLowerCase().split(/[ /-]/)[0]}
      ]
    };
  }
};
