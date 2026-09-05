module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT || 'staging';
  if (variant !== 'staging' && variant !== 'production') {
    throw new Error('APP_VARIANT must be either "staging" or "production"');
  }
  const isStaging = variant === 'staging';
  const appVariant = isStaging ? 'preview' : 'production';

  return {
    ...config,
    name: isStaging ? 'Mantle Staging' : config.name,
    scheme: isStaging ? 'accountabilityapp-staging' : config.scheme,
    extra: {
      ...config.extra,
      appVariant,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: isStaging ? 'com.awldesk.accountability.staging' : config.ios?.bundleIdentifier,
    },
    android: {
      ...config.android,
      package: isStaging ? 'com.awldesk.accountability.staging' : config.android?.package,
    },
  };
};
