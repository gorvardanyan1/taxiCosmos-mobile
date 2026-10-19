// Only Jest uses this: the apps compile this package's TypeScript with their own Metro/Babel setup (which adds the same NativeWind pieces).
module.exports = {
  presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
};
