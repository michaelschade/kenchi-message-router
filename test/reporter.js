/// <reference types="@types/node" />

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DefaultReporter } = require('@jest/reporters');

// This Jest reporter does not output any console.log except when the tests are
// failing, see: https://github.com/mozilla/addons-frontend/issues/2980.
class FingersCrossedReporter extends DefaultReporter {
  printTestFileHeader(_testPath, config, result) {
    const console = result.console;
    if (result.numFailingTests === 0 && !result.testExecError) {
      result.console = null;
    }
    super.printTestFileHeader(_testPath, config, result);
    result.console = console;
  }
}

module.exports = FingersCrossedReporter;
