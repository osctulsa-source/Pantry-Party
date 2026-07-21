module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must be listed last — rewrites worklets for the UI thread.
    plugins: ['react-native-reanimated/plugin'],
  };
};
