# Changelog

## [0.2.1](https://github.com/AraneaDev/alpheus/compare/v0.2.0...v0.2.1) (2026-09-16)


### Fixes

* ignore release configuration changes ([#19](https://github.com/AraneaDev/alpheus/issues/19)) ([1e19288](https://github.com/AraneaDev/alpheus/commit/1e192882c7b6d9287808bd2cf17e8b4595dc066d))


### Documentation

* refresh README and release filters ([#17](https://github.com/AraneaDev/alpheus/issues/17)) ([17b8c71](https://github.com/AraneaDev/alpheus/commit/17b8c71cb728bbbfa0f063914796e2d8c19169c1))

## [0.2.0](https://github.com/AraneaDev/alpheus/compare/v0.1.5...v0.2.0) (2026-09-16)


### ⚠ BREAKING CHANGES

* verify every finding against the working tree before removing it ([#12](https://github.com/AraneaDev/alpheus/issues/12))

### Features

* verify every finding against the working tree before removing it ([#12](https://github.com/AraneaDev/alpheus/issues/12)) ([9a38dd8](https://github.com/AraneaDev/alpheus/commit/9a38dd823aac4614cc4f6bc8e6166cb255b5422a))


### Continuous integration

* **pr-title:** check out the base branch, not the pull request's pinned base commit ([#15](https://github.com/AraneaDev/alpheus/issues/15)) ([b091729](https://github.com/AraneaDev/alpheus/commit/b091729aedfaccb1d99a09de8871e59bc81ebc3d))

## [0.1.5](https://github.com/AraneaDev/alpheus/compare/v0.1.4...v0.1.5) (2026-09-16)


### Continuous integration

* **pr-title:** share one commit-style rule between CI and the hook ([#13](https://github.com/AraneaDev/alpheus/issues/13)) ([1c252db](https://github.com/AraneaDev/alpheus/commit/1c252dbd6670108990b61b030eb041c20994e1b0))

## [0.1.4](https://github.com/AraneaDev/alpheus/compare/v0.1.3...v0.1.4) (2026-09-15)


### Documentation

* **readme:** credit the author and link the write-up ([#10](https://github.com/AraneaDev/alpheus/issues/10)) ([05912e9](https://github.com/AraneaDev/alpheus/commit/05912e99b3b07bb1dc2ced7a5f34a99de3bfe7df))

## [0.1.3](https://github.com/AraneaDev/alpheus/compare/v0.1.2...v0.1.3) (2026-09-15)


### Fixes

* **cli:** drop --all from clean, and pin plugin.json to the release ([#8](https://github.com/AraneaDev/alpheus/issues/8)) ([67d0c99](https://github.com/AraneaDev/alpheus/commit/67d0c99f0033005753e32a98e8e6373aac4e082f))

## [0.1.2](https://github.com/AraneaDev/alpheus/compare/v0.1.1...v0.1.2) (2026-09-15)


### Fixes

* **docs:** correct README install instructions ([#6](https://github.com/AraneaDev/alpheus/issues/6)) ([4d05162](https://github.com/AraneaDev/alpheus/commit/4d0516222f2044a56401a256c781e64ee4e5f59c))
* **docs:** restore full ANSI color palette in TUI screenshot ([#4](https://github.com/AraneaDev/alpheus/issues/4)) ([9f80f33](https://github.com/AraneaDev/alpheus/commit/9f80f33ecbe14386c9e608e396849524c81e8ed7))


### Documentation

* **readme:** bring the README in line with the other Aranea plugins ([#7](https://github.com/AraneaDev/alpheus/issues/7)) ([3130232](https://github.com/AraneaDev/alpheus/commit/3130232aee7be5ff9c7f237a4f6d82b36fa6d808))

## [0.1.1](https://github.com/AraneaDev/alpheus/compare/v0.1.0...v0.1.1) (2026-09-14)


### Features

* **cli:** add demo mode and exploratory findings for clean working trees ([c00140b](https://github.com/AraneaDev/alpheus/commit/c00140bd308d7afe9e9b75fdc3d91fb8921a1538))
* initial implementation of alpheus ([8464560](https://github.com/AraneaDev/alpheus/commit/84645604c06544620d748eae57fe559917dbe225))
* **quality:** add knip, markdownlint, JSDoc rules, and enforce &gt;=90% test coverage ([aa122b0](https://github.com/AraneaDev/alpheus/commit/aa122b0ae3a47e3cef8bd376598290424eea9190))
* **tui:** utilize full terminal width and height with alternate screen buffer ([beb5f74](https://github.com/AraneaDev/alpheus/commit/beb5f74fb1ba891091e0aaa70503a1541258c821))


### Fixes

* **ci:** ignore CHANGELOG.md in markdownlint-cli2 ([#3](https://github.com/AraneaDev/alpheus/issues/3)) ([418b8fb](https://github.com/AraneaDev/alpheus/commit/418b8fb9562dd8008e1c41d3f410a3ba2c30ec37))
* **scanner:** handle git mnemonic and custom diff prefixes ([d92facb](https://github.com/AraneaDev/alpheus/commit/d92facbf6c1f950b56494b32b9f9e654e2732243))
* **tui:** align layout columns, repair screenshot vector math, and remove emojis ([#1](https://github.com/AraneaDev/alpheus/issues/1)) ([f82ee03](https://github.com/AraneaDev/alpheus/commit/f82ee032651f6cc9d117417c178f14aa7c6a023b))


### Documentation

* adopt AraneaDev housestyle and add screenshot generation script ([00818e0](https://github.com/AraneaDev/alpheus/commit/00818e0af1078fc4680b5532c7b2d303fd069e14))


### Tests

* **resilience:** harden test suite with Chaos-MCP mutation testing ([68dfd33](https://github.com/AraneaDev/alpheus/commit/68dfd33089994ac23cfd9ba1e9a2ff14fffe8f8a))


### Continuous integration

* add GitHub Actions CI, PR title check, and release-please workflows ([4681cd0](https://github.com/AraneaDev/alpheus/commit/4681cd08ce3887018d19bd483e86e45ed8fa93b5))
