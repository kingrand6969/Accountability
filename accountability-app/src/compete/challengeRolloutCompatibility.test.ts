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

  test('hard-stops automated lockdown before a declared, evidenced adoption gate', () => {
    expect(contractSql).toContain("gate_key = 'challenge_participant_privacy_v1'");
    expect(contractSql).toContain('enabled = true');
    expect(contractSql).toContain("enabled_at >= now() - interval '24 hours'");
    expect(contractSql).toContain("enabled_at <= now() + interval '5 minutes'");
    expect(contractSql).toContain('length(trim(evidence)) >= 16');
    expect(contractSql).toContain('raise exception');
    expect(contractSql).toContain('LOCKDOWN BLOCKED');
    expect(contractSql.indexOf('LOCKDOWN BLOCKED')).toBeLessThan(
      contractSql.indexOf('drop policy if exists "Participants are public"'),
    );
  });

  test('applies the least-privilege policy only after the gate and disables legacy writes', () => {
    expect(contractSql).toContain(
      'create policy "Participants read own rows" on public.challenge_participants',
    );
    expect(contractSql).toMatch(/for select\s+using \(auth\.uid\(\) = user_id\)/);
    expect(contractSql).toContain(
      'revoke insert on table public.challenge_participants from public, anon, authenticated',
    );
    expect(contractSql).toContain(
      'revoke insert on table public.challenges from public, anon, authenticated',
    );
    expect(contractSql).toContain(
      'drop policy if exists "Join an active challenge" on public.challenge_participants',
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
  });
});
