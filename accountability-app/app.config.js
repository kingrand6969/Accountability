module.exports = ({ config }) => {
  const isStaging = process.env.APP_VARIANT === 'staging';
  const appVariant = isStaging ? 'preview' : 'production';

  return {
    ...config,
    name: isStaging ? 'AccountAbility Staging' : config.name,
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
