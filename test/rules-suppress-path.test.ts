import { describe, expect, it } from 'bun:test'
import { matchSuppressMiasma } from '../src/engine/rules/suppress.ts'
import { matchPathMiasma } from '../src/engine/rules/path.ts'

describe('Miasma Rule: [SUPPRESS]', () => {
  it('should detect TypeScript/JavaScript linter and type suppressions', () => {
    expect(matchSuppressMiasma('// eslint-disable-next-line @typescript-eslint/no-explicit-any', 'typescript')).not.toBeNull()
    expect(matchSuppressMiasma('/* eslint-disable */', 'javascript')).not.toBeNull()
    expect(matchSuppressMiasma('// @ts-ignore', 'typescript')).not.toBeNull()
    expect(matchSuppressMiasma('// @ts-expect-error', 'typescript')).not.toBeNull()
    expect(matchSuppressMiasma('// biome-ignore lint/suspicious', 'typescript')).not.toBeNull()
  })

  it('should detect Python suppressions', () => {
    expect(matchSuppressMiasma('x = 1  # noqa: E501', 'python')).not.toBeNull()
    expect(matchSuppressMiasma('# type: ignore', 'python')).not.toBeNull()
  })

  it('should detect Rust compiler allowances', () => {
    expect(matchSuppressMiasma('#[allow(unused_variables)]', 'rust')).not.toBeNull()
    expect(matchSuppressMiasma('#[allow(dead_code)]', 'rust')).not.toBeNull()
    expect(matchSuppressMiasma('#[allow(clippy::all)]', 'rust')).not.toBeNull()
  })

  it('should detect Go linter suppressions', () => {
    expect(matchSuppressMiasma('//nolint:errcheck', 'go')).not.toBeNull()
    expect(matchSuppressMiasma('// nolint', 'go')).not.toBeNull()
  })

  it('should detect PHP static analyzer suppressions', () => {
    expect(matchSuppressMiasma('// @phpstan-ignore-next-line', 'php')).not.toBeNull()
    expect(matchSuppressMiasma('/** @psalm-suppress UndefinedMethod */', 'php')).not.toBeNull()
  })

  it('should ignore regular comments', () => {
    expect(matchSuppressMiasma('// This function computes the hash', 'typescript')).toBeNull()
    expect(matchSuppressMiasma('# Read configuration file', 'python')).toBeNull()
  })
})

describe('Miasma Rule: [PATH]', () => {
  it('should detect POSIX workstation paths', () => {
    expect(matchPathMiasma('const p = "/home/tim/Work/AraneaDev/data.json";')).not.toBeNull()
    expect(matchPathMiasma('file:///home/developer/secrets.txt')).not.toBeNull()
    expect(matchPathMiasma('/Users/alex/workspace/project/config.yaml')).not.toBeNull()
  })

  it('should detect Windows workstation paths', () => {
    expect(matchPathMiasma('String path = "C:\\\\Users\\\\Bob\\\\Desktop\\\\dump.sql";')).not.toBeNull()
  })

  it('should ignore relative and generic production paths', () => {
    expect(matchPathMiasma('const rel = "./src/index.ts";')).toBeNull()
    expect(matchPathMiasma('const standard = "/var/log/app.log";')).toBeNull()
    expect(matchPathMiasma('const tmp = "/tmp/test.sock";')).toBeNull()
  })
})
