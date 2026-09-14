import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import jsdoc from 'eslint-plugin-jsdoc'

/** Exported declarations that carry the public surface, and so must be documented. */
const EXPORTED_DECLARATIONS = [
  'ExportNamedDeclaration > FunctionDeclaration',
  'ExportNamedDeclaration > ClassDeclaration',
  'ExportNamedDeclaration > TSInterfaceDeclaration',
  'ExportNamedDeclaration > TSTypeAliasDeclaration',
  'ExportNamedDeclaration > VariableDeclaration',
]

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'docs/**', '.alpheus/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser },
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': ['error', {
        publicOnly: true,
        require: {
          FunctionDeclaration: false,
          ClassDeclaration: false,
          MethodDefinition: false,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
        contexts: EXPORTED_DECLARATIONS,
      }],
      'jsdoc/require-description': ['error', { contexts: EXPORTED_DECLARATIONS }],
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/no-types': 'error',
      'jsdoc/no-undefined-types': 'off',
      'jsdoc/empty-tags': 'error',
      'jsdoc/no-multi-asterisks': 'error',

      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-control-regex': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': ['error', { allow: ['error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // Tests and scripts are not a public surface, and they print by design.
    files: ['test/**/*.ts', 'test/**/*.tsx', 'scripts/**/*.ts'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // The CLI, reporter, TUI launcher, and Claude plugin hooks output to terminal/stdout by design.
    files: ['src/cli.ts', 'src/reporter/**/*.ts', 'src/tui/**/*.tsx', 'src/hooks/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
)
