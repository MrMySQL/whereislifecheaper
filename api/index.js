// Vercel function entry. The Express app is src/api/vercel.ts, bundled to
// dist/vercel-api/ by scripts/vercel/build.sh before this function is built.
// Keeping this file plain JS stops @vercel/node from type-checking the whole
// backend on every deploy (~12s); CI does the type-checking.
module.exports = require('../dist/vercel-api/index.js').default;
