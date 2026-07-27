module.exports = ({ config }) => {
  const isStaging = process.env.APP_VARIANT === 'staging';

  if (!isStaging) {
    return config;
  }

  return {
    ...config,
    name: 'AccountAbility Staging',
    scheme: 'accountabilityapp-staging',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.awldesk.accountability.staging',
    },
    android: {
      ...config.android,
      package: 'com.awldesk.accountability.staging',
    },
  };
};
