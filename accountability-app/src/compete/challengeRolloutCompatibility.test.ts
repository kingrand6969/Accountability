import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration0040 = fs.readFileSync(
  path.resolve(root, 'supabase/migrations/0040_compete.sql'),
  'utf8',
);
const expandSql = fs.readFileSync(
  path.resolve(root, 'supabase/migrations/0099_buddy_completed_challenges.sql'),
  'utf8',
);
const contractPath = path.resolve(
  root,
  'supabase/migrations/0101_challenge_participant_privacy_lockdown.sql',
);
const contractSql = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8') : '';
const rolloutToolPath = path.resolve(root, 'scripts/check-challenge-lockdown-rollout.mjs');
const rolloutTool = fs.existsSync(rolloutToolPath) ? fs.readFileSync(rolloutToolPath, 'utf8') : '';
const rolloutTemplatePath = path.resolve(
  root,
  'scripts/challenge-lockdown-adoption.template.json',
);
const rolloutTemplate = fs.existsSync(rolloutTemplatePath)
  ? JSON.parse(fs.readFileSync(rolloutTemplatePath, 'utf8'))
  : {};
const rolloutDocPath = path.resolve(root, 'docs/releases/challenge-participant-lockdown.md');
const rolloutDoc = fs.existsSync(rolloutDocPath) ? fs.readFileSync(rolloutDocPath, 'utf8') : '';

describe('installed client compatibility stage (8218691 contract)', () => {
  test('retains legacy participant reads and insert grants until the adoption gate', () => {
    expect(migration0040).toContain('create policy "Participants are public"');
    expect(expandSql).not.toContain(
      'drop policy if exists "Participants are public" on public.challenge_participants',
    );
    expect(expandSql).not.toContain(
      'create policy "Participants read own rows" on public.challenge_participants',
    );
    expect(expandSql).not.toContain(
      'revoke insert on table public.challenge_participants from public, anon, authenticated',
    );
    expect(expandSql).not.toContain(
      'revoke insert on table public.challenges from public, anon, authenticated',
    );
    expect(expandSql).toContain(
      'grant select, insert on table public.challenge_participants to authenticated',
    );
    expect(expandSql).toContain(
      'grant insert on table public.challenges to authenticated',
    );
    expect(expandSql).toContain(
      'Compatibility stage: participant rows remain readable to authenticated clients',
    );
    expect(migration0040).toContain(
      'create policy "Leave a challenge" on public.challenge_participants',
    );
    expect(expandSql).not.toContain(
      'drop policy if exists "Leave a challenge" on public.challenge_participants',
    );
  });

  test('hardens legacy direct join against ended and client-backdated enrollment', () => {
    expect(expandSql).toContain(
      'create policy "Join an active challenge" on public.challenge_participants',
    );
    expect(expandSql).toContain('auth.uid() = user_id');
    expect(expandSql).toContain("joined_at >= now() - interval '2 minutes'");
    expect(expandSql).toContain("joined_at <= now() + interval '2 minutes'");
    expect(expandSql).toContain("c.starts_at <= now() + interval '2 minutes'");
    expect(expandSql).toContain('c.ends_at > now()');
  });

  test('keeps legacy Pro creation but rejects unsafe phone-clock windows atomically at insert', () => {
    expect(expandSql).toContain('create policy "Pro users create challenges"');
    expect(expandSql).toContain('auth.uid() = creator_id');
    expect(expandSql).toContain('is_pro = true');
    expect(expandSql).toContain("starts_at >= now() - interval '2 minutes'");
    expect(expandSql).toContain("starts_at <= now() + interval '2 minutes'");
    expect(expandSql).toContain('ends_at > now()');
  });
});

describe('gated participant privacy contract stage', () => {
  test('creates a server-only readiness gate that defaults closed', () => {
    expect(expandSql).toContain(
      'create table if not exists public.challenge_participant_lockdown_readiness',
    );
    expect(expandSql).toContain('enabled boolean not null default false');
    expect(expandSql).toContain('alter table public.challenge_participant_lockdown_readiness enable row level security');
    expect(expandSql).toContain(
      'revoke all on table public.challenge_participant_lockdown_readiness from public, anon, authenticated',
    );
    expect(expandSql).toContain("'challenge_participant_privacy_v1', false");
  });

  test('installs a finalizer without changing compatibility during normal migration apply', () => {
    expect(contractSql).toContain(
      'create or replace function public.finalize_challenge_participant_privacy_lockdown',
    );
    const withoutFinalizer = contractSql.replace(
      /create or replace function public\.finalize_challenge_participant_privacy_lockdown[\s\S]*?\$\$;/,
      '',
    );
    expect(withoutFinalizer).not.toContain(
      'drop policy if exists "Participants are public" on public.challenge_participants',
    );
    expect(withoutFinalizer).not.toContain(
      'revoke insert on table public.challenge_participants from public, anon, authenticated',
    );
    expect(withoutFinalizer).not.toContain(
      'revoke insert on table public.challenges from public, anon, authenticated',
    );
    expect(contractSql).not.toContain('LOCKDOWN BLOCKED');
  });

  test('validates fresh named zero-legacy evidence before acquiring the atomic lock', () => {
    const finalizer = contractSql.match(
      /create or replace function public\.finalize_challenge_participant_privacy_lockdown[\s\S]*?\$\$;/,
    )?.[0] ?? '';
    expect(finalizer).toContain("p_gate <> 'challenge_participant_privacy_v1'");
    expect(finalizer).toContain("p_decision <> 'APPROVED'");
    expect(finalizer).toContain('p_active_legacy_clients <> 0');
    expect(finalizer).toContain("p_observed_at < now() - interval '24 hours'");
    expect(finalizer).toContain("p_observed_at > now() + interval '5 minutes'");
    expect(finalizer).toMatch(/length\(trim\(p_reviewer\)\)\s*<\s*3/);
    expect(finalizer).toMatch(/length\(trim\(p_evidence\)\)\s*<\s*16/);
    expect(finalizer).toContain("set search_path = ''");
    expect(finalizer).toContain('security definer');
    expect(finalizer.indexOf('p_active_legacy_clients <> 0')).toBeLessThan(
      finalizer.indexOf('for update'),
    );
    expect(finalizer.indexOf("p_observed_at < now() - interval '24 hours'")).toBeLessThan(
      finalizer.indexOf('for update'),
    );
  });

  test('applies least privilege only inside the finalizer and records one completion', () => {
    const finalizer = contractSql.match(
      /create or replace function public\.finalize_challenge_participant_privacy_lockdown[\s\S]*?\$\$;/,
    )?.[0] ?? '';
    expect(finalizer).toContain(
      'create policy "Participants read own rows" on public.challenge_participants',
    );
    expect(finalizer).toMatch(/for select\s+using \(auth\.uid\(\) = user_id\)/);
    expect(finalizer).toContain(
      'revoke insert on table public.challenge_participants from public, anon, authenticated',
    );
    expect(finalizer).toContain(
      'revoke insert on table public.challenges from public, anon, authenticated',
    );
    expect(finalizer).toContain(
      'drop policy if exists "Join an active challenge" on public.challenge_participants',
    );
    expect(finalizer).toContain('select completed_at');
    expect(finalizer).toContain('for update');
    expect(finalizer).toMatch(/if v_completed_at is not null then\s+return false/);
    expect(finalizer).toContain('completed_at = now()');
    expect(finalizer).toContain('return true');
  });

  test('exposes the finalizer only to trusted operator roles', () => {
    expect(contractSql).toContain(
      'revoke execute on function public.finalize_challenge_participant_privacy_lockdown',
    );
    expect(contractSql).toContain('from public, anon, authenticated');
    expect(contractSql).toContain('to service_role, postgres');
    expect(contractSql).toContain("notify pgrst, 'reload schema'");
    expect(contractSql).toContain(
      'revoke all on table public.challenge_participant_lockdown_readiness from service_role',
    );
  });
});

describe('checked adoption evidence', () => {
  test('requires zero active legacy clients and fresh named approval', () => {
    expect(rolloutTool).toContain("gate === 'challenge_participant_privacy_v1'");
    expect(rolloutTool).toContain("decision === 'APPROVED'");
    expect(rolloutTool).toContain('activeLegacyClients === 0');
    expect(rolloutTool).toContain('MAX_EVIDENCE_AGE_MS');
    expect(rolloutTool).toContain('reviewer');
    expect(rolloutTool).toContain('evidence');
    expect(rolloutTool).toContain('finalize_challenge_participant_privacy_lockdown');
  });

  test('ships a deliberately unusable template and an explicit operational contract', () => {
    expect(rolloutTemplate.gate).toBe('challenge_participant_privacy_v1');
    expect(rolloutTemplate.decision).not.toBe('APPROVED');
    expect(rolloutTemplate.activeLegacyClients).not.toBe(0);
    expect(rolloutDoc).toContain('8218691');
    expect(rolloutDoc).toContain('Privacy is not yet remediated in Stage A');
    expect(rolloutDoc).toContain('zero active legacy clients');
    expect(rolloutDoc).toContain('0101_challenge_participant_privacy_lockdown.sql');
    expect(rolloutDoc).toContain('challenge_participant_lockdown_readiness');
    expect(rolloutDoc).toContain('Normal migration application and fresh database reset succeed');
    expect(rolloutDoc).toContain(
      'select public.finalize_challenge_participant_privacy_lockdown',
    );
  });
});
