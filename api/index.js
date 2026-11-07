// Vercel function entry. The Express app is src/api/vercel.ts, bundled to
// dist/vercel-api/ by scripts/vercel/build.sh before this function is built.
// Plain JS, so @vercel/node traces and packages one bundle rather than
// compiling each backend TypeScript file itself. CI does the type-checking.
module.exports = require('../dist/vercel-api/index.js').default;
