module.exports = {
  preset: 'jest-expo',
  modulePathIgnorePatterns: ['<rootDir>/admin-site/', '<rootDir>/share-site/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@supabase/.*))',
  ],
};
