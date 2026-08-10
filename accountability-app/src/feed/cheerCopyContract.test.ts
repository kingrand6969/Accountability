import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, test } from '@jest/globals';
import {
  presentationTraitName,
  presentationTraits,
  storageTraitName,
  storageTraits,
  traitOptionSelected,
} from '../buddy/presentation';

const repoRoot = path.resolve(__dirname, '../..');
const legacyCopy = /\bencourag(?:e|es|ed|ing|ement|ements|er|ers)\b/i;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    if (!/\.tsx?$/.test(entry) || /\.test\.[jt]sx?$/.test(entry)) return [];
    return [absolute];
  });
}

function presentationLiterals(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const matches: string[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isStringLiteral(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node)
      || ts.isTemplateTail(node)
      || ts.isJsxText(node)
    ) {
      const text = node.getText(parsed).replace(/^['"`]|['"`]$/g, '').trim();
      const relativeFile = path.relative(repoRoot, file).replace(/\\/g, '/');
      if (legacyCopy.test(text)) matches.push(`${relativeFile}: ${text}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(parsed);
  return matches;
}

function isAllowedInternalLiteral(match: string) {
  const normalized = match.replace(/\\/g, '/');
  const separator = normalized.indexOf(': ');
  if (separator < 0) return false;
  const file = normalized.slice(0, separator);
  const literal = normalized.slice(separator + 2);
  const allowedByFile: Record<string, string[]> = {
    'src/buddy/presentation.ts': ['Encouraging'],
    'src/feed/api.ts': [
      'post_encouragements',
      'id,body,image_url,created_at,user_id,audience,post_type,share_data,activity_id,post_likes(count),post_comments(count),post_encouragements(count),post_tags(user_id),event:events(id,title,starts_at,location,group_id)',
    ],
    'src/journey/encouragement.ts': ['post_encouragements'],
    'src/journey/JournalScreen.tsx': ['./encouragement'],
    'src/journey/JourneyEncouragementBar.tsx': ['./encouragement'],
    'src/journey/MomentumScreen.tsx': ['./encouragement'],
  };
  return allowedByFile[file]?.includes(literal) ?? false;
}

describe('Cheer user-facing copy contract', () => {
  test('classifies the legacy trait exception on Windows and POSIX paths', () => {
    expect(isAllowedInternalLiteral('src\\buddy\\presentation.ts: Encouraging')).toBe(true);
    expect(isAllowedInternalLiteral('src/buddy/presentation.ts: Encouraging')).toBe(true);
  });

  test('rejects UI copy that merely contains an internal identifier', () => {
    expect(isAllowedInternalLiteral('src/feed/api.ts: UI encouragement for post_encouragements')).toBe(false);
  });

  test('all live TypeScript presentation literals use Cheer wording', () => {
    const matches = sourceFiles(path.join(repoRoot, 'src')).flatMap(presentationLiterals);

    // Stable persistence identifiers and the existing module path are intentionally unchanged
    // for migration and import compatibility. None of these literals are rendered as copy.
    const allowedInternalLiterals = matches.filter(isAllowedInternalLiteral);
    const userFacingLiterals = matches.filter((match) => !allowedInternalLiterals.includes(match));

    expect(userFacingLiterals).toEqual([]);
    expect(allowedInternalLiterals.length).toBeGreaterThan(0);
    expect(allowedInternalLiterals.some((match) => match.endsWith('./encouragement'))).toBe(true);
  });

  test('native microphone permission copy uses voice Cheer wording', () => {
    const appConfig = readFileSync(path.join(repoRoot, 'app.json'), 'utf8');
    expect(appConfig).not.toMatch(legacyCopy);
    expect(appConfig).toContain('record a voice Cheer');
  });

  test('maps the legacy persisted trait to Cheering at the UI boundary', () => {
    expect(presentationTraitName('Encouraging')).toBe('Cheering');
    expect(presentationTraitName('Consistent')).toBe('Consistent');
  });

  test('keeps a legacy Cheering trait selected in the editor', () => {
    expect(traitOptionSelected(['Encouraging'], 'Cheering')).toBe(true);
    expect(traitOptionSelected(['Consistent'], 'Cheering')).toBe(false);
  });

  test('stores the displayed Cheering trait using the canonical legacy value', () => {
    expect(storageTraitName('Cheering')).toBe('Encouraging');
    expect(storageTraits(['Cheering', 'Consistent'])).toEqual(['Encouraging', 'Consistent']);
  });

  test('round-trips legacy stored traits through the editor presentation boundary', () => {
    const stored = ['Encouraging', 'Consistent'];
    const displayed = presentationTraits(stored);

    expect(displayed).toEqual(['Cheering', 'Consistent']);
    expect(storageTraits(displayed)).toEqual(stored);
  });

  test('buddy card editing applies presentation mapping on load and storage mapping on save', () => {
    const editor = readFileSync(path.join(repoRoot, 'src/app/buddy-card-edit.tsx'), 'utf8');
    expect(editor).toContain('traits: presentationTraits(loaded.traits)');
    expect(editor).toContain('traits: storageTraits(card.traits)');
  });
});
