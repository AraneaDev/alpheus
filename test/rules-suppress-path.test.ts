import { describe, expect, it } from 'bun:test'
import { matchSuppressMiasma } from '../src/engine/rules/suppress.ts'
import { matchPathMiasma } from '../src/engine/rules/path.ts'

describe('Miasma Rule: [SUPPRESS]', () => {
  it('should detect TypeScript/JavaScript linter and type suppressions', () => {
    expect(matchSuppressMiasma('  // eslint-disable-next-line @typescript-eslint/no-explicit-any  ', 'typescript'))
      .toBe('ESLint rule suppression comment')
    expect(matchSuppressMiasma('const x = 1 // eslint-disable-line no-var', 'javascript'))
      .toBe('ESLint rule suppression comment')
    expect(matchSuppressMiasma('/* eslint-disable */', 'javascript'))
      .toBe('ESLint rule suppression comment')
    expect(matchSuppressMiasma('// @ts-ignore', 'typescript'))
      .toBe('TypeScript compiler error suppression comment')
    expect(matchSuppressMiasma('// @ts-expect-error', 'typescript'))
      .toBe('TypeScript compiler error suppression comment')
    expect(matchSuppressMiasma('// @ts-nocheck', 'typescript'))
      .toBe('TypeScript compiler error suppression comment')
    expect(matchSuppressMiasma('// biome-ignore lint/suspicious', 'typescript'))
      .toBe('Biome linter suppression comment')
    expect(matchSuppressMiasma('// prettier-ignore', 'typescript'))
      .toBe('Prettier formatting suppression comment')
  })

  it('should detect Python suppressions', () => {
    expect(matchSuppressMiasma('x = 1  # noqa: E501', 'python'))
      .toBe('Python flake8/ruff noqa suppression comment')
    expect(matchSuppressMiasma('x = 1 #noqa', 'python'))
      .toBe('Python flake8/ruff noqa suppression comment')
    expect(matchSuppressMiasma('# type: ignore', 'python'))
      .toBe('Python type checker (mypy/pyright) suppression comment')
    expect(matchSuppressMiasma('#type:ignore', 'python'))
      .toBe('Python type checker (mypy/pyright) suppression comment')
    expect(matchSuppressMiasma('# type:ignore', 'python'))
      .toBe('Python type checker (mypy/pyright) suppression comment')
    expect(matchSuppressMiasma('x = 1', 'python')).toBeNull()
  })

  it('should detect Rust compiler allowances', () => {
    expect(matchSuppressMiasma('#[allow(unused_variables)]', 'rust'))
      .toBe('Rust compiler or clippy lint allowance attribute')
    expect(matchSuppressMiasma('#[allow(dead_code)]', 'rust'))
      .toBe('Rust compiler or clippy lint allowance attribute')
    expect(matchSuppressMiasma('#[allow(clippy::all)]', 'rust'))
      .toBe('Rust compiler or clippy lint allowance attribute')
    expect(matchSuppressMiasma('let x = 1;', 'rust')).toBeNull()
  })

  it('should detect Go linter suppressions', () => {
    expect(matchSuppressMiasma('//nolint:errcheck', 'go'))
      .toBe('Go linter suppression comment')
    expect(matchSuppressMiasma('// nolint', 'go'))
      .toBe('Go linter suppression comment')
    expect(matchSuppressMiasma('//nolint', 'go'))
      .toBe('Go linter suppression comment')
    expect(matchSuppressMiasma('// regular comment', 'go')).toBeNull()
  })

  it('should detect PHP static analyzer suppressions', () => {
    expect(matchSuppressMiasma('// @phpstan-ignore-next-line', 'php'))
      .toBe('PHP static analysis suppression comment')
    expect(matchSuppressMiasma('/** @psalm-suppress UndefinedMethod */', 'php'))
      .toBe('PHP static analysis suppression comment')
    expect(matchSuppressMiasma('// regular comment', 'php')).toBeNull()
  })

  it('should ignore regular comments and unknown languages', () => {
    expect(matchSuppressMiasma('// This function computes the hash', 'typescript')).toBeNull()
    expect(matchSuppressMiasma('# Read configuration file', 'python')).toBeNull()
    expect(matchSuppressMiasma('// @ts-ignore', 'unknown')).toBeNull()
  })
})

describe('Miasma Rule: [PATH]', () => {
  it('should detect POSIX workstation paths', () => {
    expect(matchPathMiasma('const p = "/home/tim/Work/AraneaDev/data.json";'))
      .toBe('Hardcoded workstation absolute home directory path')
    expect(matchPathMiasma('file:///home/developer/secrets.txt'))
      .toBe('Hardcoded workstation absolute home directory path')
    expect(matchPathMiasma('/Users/alex/workspace/project/config.yaml'))
      .toBe('Hardcoded workstation absolute home directory path')
    expect(matchPathMiasma('HOME_DIR=/home/agent/tmp/'))
      .toBe('Hardcoded workstation absolute home directory path')
    expect(matchPathMiasma('(/Users/developer/)'))
      .toBe('Hardcoded workstation absolute home directory path')
    expect(matchPathMiasma('`file:///Users/dev/`'))
      .toBe('Hardcoded workstation absolute home directory path')
  })

  it('should detect Windows workstation paths', () => {
    expect(matchPathMiasma('String path = "C:\\\\Users\\\\Bob\\\\Desktop\\\\dump.sql";'))
      .toBe('Hardcoded Windows workstation user directory path')
    expect(matchPathMiasma('C:\\Users\\Bob\\Documents\\'))
      .toBe('Hardcoded Windows workstation user directory path')
    expect(matchPathMiasma('d:\\users\\alice\\'))
      .toBe('Hardcoded Windows workstation user directory path')
    expect(matchPathMiasma('("D:\\\\Users\\\\test\\\\")'))
      .toBe('Hardcoded Windows workstation user directory path')
  })

  it('should ignore relative and generic production paths', () => {
    expect(matchPathMiasma('const rel = "./src/index.ts";')).toBeNull()
    expect(matchPathMiasma('const standard = "/var/log/app.log";')).toBeNull()
    expect(matchPathMiasma('const tmp = "/tmp/test.sock";')).toBeNull()
    expect(matchPathMiasma('/homecoming/banner.png')).toBeNull()
    expect(matchPathMiasma('C:\\UsersProfile\\config.ini')).toBeNull()
  })
})
