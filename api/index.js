// Vercel function entry. The Express app is src/api/vercel.ts, bundled to
// dist/vercel-api/ by scripts/vercel/build.sh before this function is built.
// Shipping plain JS here means @vercel/node traces one bundle instead of
// compiling and type-checking every backend file itself; CI type-checks.
module.exports = require('../dist/vercel-api/index.js').default;
