const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const metroRoot = path.dirname(require.resolve('metro/package.json'));
const metroImageSize = require.resolve('image-size', { paths: [metroRoot] });
const { disableTypes } = require(metroImageSize);

// Metro never ships these formats in this app. Keep the unpatched parsers
// unreachable while image-size has no published fix for its infinite loops.
disableTypes(['heif', 'icns', 'j2c', 'jp2', 'jxl', 'jxl-stream']);

module.exports = getDefaultConfig(__dirname);
