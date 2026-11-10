import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as Record<string, unknown>;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('manifest permissions (least privilege)', () => {
  it('is a Manifest V3 extension', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('requests exactly sidePanel, activeTab and storage', () => {
    expect([...(manifest.permissions as string[])].sort()).toEqual(['activeTab', 'sidePanel', 'storage']);
  });

  it('has no broad host access, content scripts or external connectivity', () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.commands).toBeUndefined();
  });

  it('uses a strict extension-page CSP: no remote or inline script, network only to local Ollama', () => {
    const csp = (manifest.content_security_policy as { extension_pages: string }).extension_pages;
    const directives = Object.fromEntries(
      csp.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(' ')]),
    );
    expect(directives).toEqual({
      'script-src': "'self'",
      'object-src': "'self'",
      // D-020: the only network destination is Ollama on loopback.
      'connect-src': "'self' http://127.0.0.1:11434",
    });
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|https:|\*/);
  });

  it('points at files that exist in the source tree', () => {
    const background = (manifest.background as { service_worker: string }).service_worker;
    expect(background).toBe('background.js'); // emitted by vite.config.ts from src/background/index.ts
    const sidePanel = (manifest.side_panel as { default_path: string }).default_path;
    expect(() => readFileSync(join(root, sidePanel))).not.toThrow();
    for (const icon of Object.values(manifest.icons as Record<string, string>)) {
      expect(() => readFileSync(join(root, 'public', icon))).not.toThrow();
    }
  });
});

describe('no trading automation or site interference in source', () => {
  const files = sourceFiles(join(root, 'src'));
  const banned: [RegExp, string][] = [
    [/chrome\.scripting/, 'script injection'],
    [/chrome\.debugger/, 'debugger protocol'],
    [/chrome\.webRequest/, 'request interception'],
    [/chrome\.declarativeNetRequest/, 'request rewriting'],
    [/chrome\.cookies/, 'cookie access'],
    [/chrome\.webNavigation/, 'navigation tracking'],
    [/executeScript|insertCSS/, 'script injection'],
    [/\beval\s*\(|new\s+Function\s*\(/, 'dynamic code execution'],
    [/\bfetch\s*\(\s*['"`]https?:/, 'hard-coded network call'],
    [/XMLHttpRequest|WebSocket|sendBeacon/, 'network channel'],
    [/\.click\s*\(\)|dispatchEvent\s*\(/, 'synthetic clicks/events'],
    [/\/(place-?order|buy|sell|withdraw|deposit)\b/i, 'trading endpoint'],
  ];

  it('only ever addresses local Ollama on loopback (D-020)', () => {
    const urls = files.flatMap((file) => readFileSync(file, 'utf8').match(/\bhttps?:\/\/[^\s'"`)]+/g) ?? []);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toBe('http://127.0.0.1:11434');
  });

  it('scans a non-trivial number of source files', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(banned)('contains no %s pattern (%s)', (pattern) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
