import app from '../src/app';

export default app;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = app;
  module.exports.default = app;
}
