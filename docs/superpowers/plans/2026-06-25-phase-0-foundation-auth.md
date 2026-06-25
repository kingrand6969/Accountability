# Phase 0 (Part 1) — Project Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Accountability App as a real, installable Expo app where a user can sign up, log in, stay logged in across restarts, and land on a 5-tab navigation shell.

**Architecture:** Expo (React Native) with Expo Router for file-based navigation. Supabase provides auth + session storage. An `AuthProvider` React context exposes the current session; the root layout uses it as a routing guard that sends logged-out users to the auth screens and logged-in users to the main tab shell. Pure logic (input validation) is unit-tested with Jest; screens are verified manually on a device.

**Tech Stack:** Expo SDK (latest), TypeScript, Expo Router, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, Jest (`jest-expo`).

**Repo layout:** Git repo root is `C:\Users\KinGrand\New folder`. The Expo app is created at `C:\Users\KinGrand\New folder\accountability-app\`. **All file paths below are relative to `accountability-app/`** unless stated otherwise. Run all `npm`/`npx` commands from inside `accountability-app/`.

---

## Execution notes (SDK 56 adaptations — applied 2026-06-25)

The scaffold installed **Expo SDK 56**, which differs from this plan's original
assumptions. The following deviations were made during execution and are the
source of truth:

- **Route directory is `src/app/`** (not root `app/`). All route paths below map
  to `src/app/...`.
- **Auth pattern uses `Stack.Protected` with a `guard` prop** (the SDK 56
  recommended approach) instead of the older `useSegments` + `router.replace`
  redirect in the root layout.
- **Auth screens are top-level `src/app/sign-in.tsx` and `src/app/sign-up.tsx`**
  (not an `(auth)` route group), which avoids a grouped-index route collision.
- **`reset-project` was not run** (it is interactive); the leftover starter files
  (`src/app/index.tsx`, `src/app/explore.tsx`, and the unused
  `src/components/`, `src/constants/`, `src/hooks/`, `src/global.css`) were
  deleted directly instead.
- **Test file imports Jest globals** via `import { describe, it, expect } from '@jest/globals'`
  so `tsc --noEmit` passes cleanly.
- The Expo app lives at `accountability-app/`; the git repo root is the parent
  `New folder/`. Work happens on branch `phase-0-foundation-auth`.

---

### Task 1: Scaffold the Expo app

**Files:**
- Create: entire `accountability-app/` project tree (generated)

- [ ] **Step 1: Generate the project**

Run from `C:\Users\KinGrand\New folder`:

```bash
npx create-expo-app@latest accountability-app
```

Expected: a new `accountability-app/` folder with `package.json`, an `app/` directory (Expo Router), and an example tabs layout.

- [ ] **Step 2: Reset to a blank baseline**

Run from `accountability-app/`:

```bash
npm run reset-project
```

When prompted, choose to **delete** the example files. This moves the starter example aside and leaves a minimal `app/` directory. If a leftover `app-example/` folder remains, delete it.

- [ ] **Step 3: Verify it boots**

Run from `accountability-app/`:

```bash
npx expo start
```

Expected: Metro bundler starts and prints a QR code with no errors. Press `Ctrl+C` to stop.

- [ ] **Step 4: Commit**

Run from `C:\Users\KinGrand\New folder`:

```bash
git add -A
git commit -m "chore: scaffold Expo app (accountability-app)"
```

---

### Task 2: Install dependencies and configure Jest

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`

- [ ] **Step 1: Install runtime dependencies**

Run from `accountability-app/`:

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

- [ ] **Step 2: Install test dependencies**

Run from `accountability-app/`:

```bash
npm install --save-dev jest jest-expo @types/jest
```

- [ ] **Step 3: Add the test script and Jest config**

In `package.json`, add a `"test"` script under `"scripts"`:

```json
"test": "jest"
```

Create `jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@supabase/.*))',
  ],
};
```

- [ ] **Step 4: Verify Jest runs**

Run from `accountability-app/`:

```bash
npx jest --version
```

Expected: prints a version number (e.g. `29.x.x`) with no error.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add Supabase, AsyncStorage, and Jest dependencies"
```

---

### Task 3: Create the Supabase project (MANUAL CHECKPOINT)

> ⛔ **This task needs the project owner.** It creates the free cloud backend and produces two secret-ish values the app needs. Stop here and do this together.

- [ ] **Step 1: Create a free Supabase project**

Go to https://supabase.com → sign in (Google works) → **New project**. Name it `accountability-app`, choose a region near you, set a database password (save it somewhere safe), and create. Wait ~2 minutes for provisioning.

- [ ] **Step 2: Copy the two values the app needs**

In the project dashboard → **Project Settings → API**:
- **Project URL** (looks like `https://abcdxyz.supabase.co`)
- **anon public** key (a long string — this one is safe to ship in the app)

- [ ] **Step 3: Save them as environment variables**

Create `accountability-app/.env` (this file is gitignored — never commit it):

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Replace both values with the ones from Step 2.

- [ ] **Step 4: Confirm `.env` is ignored**

Run from `C:\Users\KinGrand\New folder`:

```bash
git check-ignore accountability-app/.env
```

Expected: prints `accountability-app/.env` (meaning it IS ignored). If it prints nothing, add `.env` to `.gitignore` before continuing.

---

### Task 4: Supabase client module

**Files:**
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Create the client**

Create `src/lib/supabase.ts`:

```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check accountability-app/.env',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client"
```

---

### Task 5: Auth input validation (TDD)

**Files:**
- Create: `src/auth/validation.ts`
- Test: `src/auth/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/auth/validation.test.ts`:

```ts
import { validateEmail, validatePassword } from './validation';

describe('validateEmail', () => {
  it('rejects an empty email', () => {
    expect(validateEmail('')).toBe('Email is required.');
  });
  it('rejects a malformed email', () => {
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address.');
  });
  it('accepts a valid email (returns null)', () => {
    expect(validateEmail('user@example.com')).toBeNull();
  });
  it('trims surrounding whitespace before validating', () => {
    expect(validateEmail('  user@example.com  ')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('rejects an empty password', () => {
    expect(validatePassword('')).toBe('Password is required.');
  });
  it('rejects a password shorter than 8 characters', () => {
    expect(validatePassword('short')).toBe(
      'Password must be at least 8 characters.',
    );
  });
  it('accepts an 8+ character password (returns null)', () => {
    expect(validatePassword('longenough')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `accountability-app/`:

```bash
npx jest src/auth/validation.test.ts
```

Expected: FAIL — `Cannot find module './validation'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/auth/validation.ts`:

```ts
export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email is required.';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(trimmed)) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/auth/validation.test.ts
```

Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add auth input validation with tests"
```

---

### Task 6: Auth context provider

**Files:**
- Create: `src/auth/AuthProvider.tsx`

- [ ] **Step 1: Implement the provider**

Create `src/auth/AuthProvider.tsx`:

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add AuthProvider context"
```

---

### Task 7: Root layout with routing guard

**Files:**
- Create/Replace: `app/_layout.tsx`

- [ ] **Step 1: Remove leftover template routes**

The `reset-project` step leaves a starter `app/index.tsx` (route `/`). It would collide with `app/(app)/index.tsx` (also route `/`) and make Expo Router throw a duplicate-route error. Delete it and any other leftover route files so `app/` contains only what this plan creates.

Run from `accountability-app/`:

```bash
rm -f app/index.tsx
```

Expected: after this plan, `app/` contains only `_layout.tsx`, `(auth)/`, and `(app)/`.

- [ ] **Step 2: Implement the root layout**

Replace the contents of `app/_layout.tsx` with:

```tsx
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: root layout with auth routing guard"
```

---

### Task 8: Auth screens (login + signup)

**Files:**
- Create: `app/(auth)/_layout.tsx`
- Create: `app/(auth)/login.tsx`
- Create: `app/(auth)/signup.tsx`

- [ ] **Step 1: Auth stack layout**

Create `app/(auth)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Login screen**

Create `app/(auth)/login.tsx`:

```tsx
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { validateEmail, validatePassword } from '../../src/auth/validation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      Alert.alert('Check your details', emailError ?? passwordError ?? '');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) Alert.alert('Could not sign in', error.message);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.button} onPress={onSignIn} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Log in</Text>
        )}
      </Pressable>
      <Link href="/(auth)/signup" style={styles.link}>
        No account yet? Sign up
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#2563eb', marginTop: 8 },
});
```

- [ ] **Step 3: Signup screen**

Create `app/(auth)/signup.tsx`:

```tsx
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { validateEmail, validatePassword } from '../../src/auth/validation';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSignUp() {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      Alert.alert('Check your details', emailError ?? passwordError ?? '');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not sign up', error.message);
    } else {
      Alert.alert(
        'Check your email',
        'Confirm your email address to finish signing up, then log in.',
      );
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (8+ characters)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.button} onPress={onSignUp} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign up</Text>
        )}
      </Pressable>
      <Link href="/(auth)/login" style={styles.link}>
        Already have an account? Log in
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#2563eb', marginTop: 8 },
});
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: login and signup screens"
```

---

### Task 9: Main tab shell with 5 placeholder screens

**Files:**
- Create: `app/(app)/_layout.tsx`
- Create: `app/(app)/index.tsx` (Today)
- Create: `app/(app)/feed.tsx`
- Create: `app/(app)/add.tsx`
- Create: `app/(app)/activity.tsx`
- Create: `app/(app)/profile.tsx`

- [ ] **Step 1: Tab layout**

Create `app/(app)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';

export default function AppLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="add" options={{ title: 'Add' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Today / timeline placeholder**

Create `app/(app)/index.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

export default function Today() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Today</Text>
      <Text style={styles.sub}>Your daily timeline will live here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 24, fontWeight: '700' },
  sub: { color: '#666', marginTop: 8, textAlign: 'center' },
});
```

- [ ] **Step 3: Feed placeholder**

Create `app/(app)/feed.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

export default function Feed() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Feed</Text>
      <Text style={styles.sub}>Friends’ wins and streaks will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 24, fontWeight: '700' },
  sub: { color: '#666', marginTop: 8, textAlign: 'center' },
});
```

- [ ] **Step 4: Add placeholder**

Create `app/(app)/add.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

export default function Add() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Add</Text>
      <Text style={styles.sub}>Quick-add events, workouts, and more.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 24, fontWeight: '700' },
  sub: { color: '#666', marginTop: 8, textAlign: 'center' },
});
```

- [ ] **Step 5: Activity placeholder**

Create `app/(app)/activity.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

export default function Activity() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Activity</Text>
      <Text style={styles.sub}>GPS runs, rides, and walks will live here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 24, fontWeight: '700' },
  sub: { color: '#666', marginTop: 8, textAlign: 'center' },
});
```

- [ ] **Step 6: Profile placeholder with sign-out**

Create `app/(app)/profile.tsx`:

```tsx
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/auth/AuthProvider';

export default function Profile() {
  const { session } = useAuth();

  async function onSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Could not sign out', error.message);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Profile</Text>
      <Text style={styles.sub}>{session?.user.email ?? 'Signed in'}</Text>
      <Pressable style={styles.button} onPress={onSignOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  heading: { fontSize: 24, fontWeight: '700' },
  sub: { color: '#666' },
  button: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: main tab shell with placeholder screens and sign-out"
```

---

### Task 10: End-to-end verification on a device

**Files:** none (manual verification)

- [ ] **Step 1: Confirm unit tests pass**

Run from `accountability-app/`:

```bash
npx jest
```

Expected: all tests PASS.

- [ ] **Step 2: Run the app**

Run from `accountability-app/`:

```bash
npx expo start
```

Install **Expo Go** on your phone (App Store / Play Store) and scan the QR code, OR press `a` for an Android emulator / `i` for an iOS simulator.

- [ ] **Step 3: Walk the happy path**

Verify in order:
1. App opens on the **Login** screen (because no session exists yet).
2. Tap **Sign up**, create an account with a real email + 8+ char password → see the "check your email" alert.
3. Confirm the email via the link Supabase sent.
4. Back on **Login**, log in → you land on the **Today** tab with all 5 tabs visible.
5. Fully close the app and reopen it → you go **straight to Today** (session persisted).
6. Go to **Profile** → tap **Sign out** → you return to **Login**.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify Phase 0 part 1 foundation and auth"
```

---

## Done criteria

- A user can sign up, confirm email, log in, and stay logged in across restarts.
- Logged-out users are forced to the auth screens; logged-in users land on the tab shell.
- Five tabs render (Today, Feed, Add, Activity, Profile) as placeholders.
- Sign-out returns to login.
- `npx jest` passes.

## What this plan intentionally does NOT cover (next plans)

- Profile fields/editing (name, photo, birthday + privacy, relationship status, area) — next plan.
- The real daily timeline data model and Today UI — next plan.
- The social feed data and UI — next plan.
- Pro/subscription + ads scaffolding (RevenueCat/AdMob) — later plan.
- Google login — later (email/password first).
