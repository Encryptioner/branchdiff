# Changelog

All notable changes to `@encryptioner/branchdiff` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-10

### Added
- Initial npm release.
- File-level branch comparison via blob-hash diffing (`--mode file`).
- Standard git-diff mode (`--mode git`).
- Browser-based UI with split and unified views.
- Multi-instance support — auto-incrementing ports from 5391 with registry at `~/.branchdiff/registry.json`.
- GitHub PR checkout via URL (`branchdiff https://github.com/owner/repo/pull/123`).
- Comment export and AI agent endpoints.
- Commands: `list`, `kill`, `prune`, `tree`, `open`, `doctor`, `update`.
