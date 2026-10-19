module.exports = function (api) {
  api.cache(true);

  // NativeWind turns `className` into styles; both pieces are required (see packages/ui).
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
