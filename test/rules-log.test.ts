import { describe, expect, it } from 'bun:test'
import { detectLanguage } from '../src/engine/language.ts'
import { matchLogMiasma } from '../src/engine/rules/log.ts'

describe('Language Classifier', () => {
  it('should detect file languages by extension', () => {
    expect(detectLanguage('src/app.ts')).toBe('typescript')
    expect(detectLanguage('src/component.tsx')).toBe('typescript')
    expect(detectLanguage('lib/util.js')).toBe('javascript')
    expect(detectLanguage('scripts/run.py')).toBe('python')
    expect(detectLanguage('src/main.rs')).toBe('rust')
    expect(detectLanguage('cmd/server.go')).toBe('go')
    expect(detectLanguage('api/index.php')).toBe('php')
    expect(detectLanguage('bin/deploy.sh')).toBe('shell')
    expect(detectLanguage('unknown.xyz')).toBe('unknown')
  })
})

describe('Miasma Rule: [LOG]', () => {
  it('should detect TypeScript/JavaScript debug prints', () => {
    expect(matchLogMiasma('console.log("token:", token);', 'typescript')).not.toBeNull()
    expect(matchLogMiasma('  console.debug({ state });', 'javascript')).not.toBeNull()
    expect(matchLogMiasma('console.dir(items)', 'typescript')).not.toBeNull()
    expect(matchLogMiasma('console.time("calc")', 'typescript')).not.toBeNull()
  })

  it('should ignore legitimate TypeScript/JavaScript production logging', () => {
    expect(matchLogMiasma('console.error("Failed to connect", err);', 'typescript')).toBeNull()
    expect(matchLogMiasma('console.warn("Deprecation warning");', 'typescript')).toBeNull()
    expect(matchLogMiasma('console.assert(x > 0);', 'typescript')).toBeNull()
    expect(matchLogMiasma('const text = "Run console.log to see output";', 'typescript')).toBeNull()
  })

  it('should detect Python debug statements', () => {
    expect(matchLogMiasma('print(f"Debug: {user}")', 'python')).not.toBeNull()
    expect(matchLogMiasma('breakpoint()', 'python')).not.toBeNull()
    expect(matchLogMiasma('pdb.set_trace()', 'python')).not.toBeNull()
    expect(matchLogMiasma('logging.debug("calc")', 'python')).not.toBeNull()
  })

  it('should detect Rust debug prints', () => {
    expect(matchLogMiasma('dbg!(&my_struct);', 'rust')).not.toBeNull()
    expect(matchLogMiasma('println!("debug: {:?}", val);', 'rust')).not.toBeNull()
  })

  it('should detect Go debug prints', () => {
    expect(matchLogMiasma('fmt.Println("debug user:", u)', 'go')).not.toBeNull()
    expect(matchLogMiasma('log.Println("debug token")', 'go')).not.toBeNull()
  })

  it('should detect PHP dump calls', () => {
    expect(matchLogMiasma('var_dump($response);', 'php')).not.toBeNull()
    expect(matchLogMiasma('dd($data);', 'php')).not.toBeNull()
    expect(matchLogMiasma('dump($params);', 'php')).not.toBeNull()
  })

  it('should detect Shell debug tracing', () => {
    expect(matchLogMiasma('set -x', 'shell')).not.toBeNull()
    expect(matchLogMiasma('echo "DEBUG: done"', 'shell')).not.toBeNull()
    expect(matchLogMiasma('echo "hello world"', 'shell')).toBeNull()
  })

  it('should handle inline statements, negative cases, and unknown languages', () => {
    expect(matchLogMiasma('const x = 1; console.log(x)', 'javascript')).not.toBeNull()
    expect(matchLogMiasma('const x = 1;', 'javascript')).toBeNull()
    expect(matchLogMiasma('x = 1', 'python')).toBeNull()
    expect(matchLogMiasma('let x = 1;', 'rust')).toBeNull()
    expect(matchLogMiasma('x := 1', 'go')).toBeNull()
    expect(matchLogMiasma('$x = 1;', 'php')).toBeNull()
    expect(matchLogMiasma('console.log("hi")', 'unknown')).toBeNull()
  })
})
