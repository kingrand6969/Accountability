# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Deploy Configuration

- Expo account/project: `@kingrand/accountability-app`
- EAS project ID: `f91c0791-4a6e-4080-88fd-5cc9a4e720bf`
- Staging mobile build: Android `preview` profile, internal APK distribution
- Staging update channel/environment: `preview`
- Staging app identity: `AccountAbility Staging`
  (`com.awldesk.accountability.staging`)
- Production mobile build: `production` profile and `production` channel
- Never deploy the `production` profile or publish to the `production` channel
  without an approved Release Control record.
- Staging Supabase credentials live in the EAS `preview` environment and the
  ignored local `.env.local`; production credentials must not be copied into
  either location.
- This is a multi-project Git workspace. Run EAS from `accountability-app` with
  `EAS_NO_VCS=1` so unrelated projects and repository history are not uploaded.
