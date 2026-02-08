# Native Helper Beta Setup Checklist

Use this checklist before publishing a beta/dev Windows native helper setup
archive. This release path is intentionally a PowerShell wrapper; signed
MSI/EXE packaging is deferred.

- [ ] PowerShell setup package is versioned.
- [ ] Published archive hash is recorded in release notes.
- [ ] Setup prints each `winget` command before it can execute.
- [ ] Setup asks for confirmation before `winget` dependency installs unless
  `-AssumeYes` is passed.
- [ ] Node and FFmpeg package IDs are documented and configurable through
  `-NodePackageId` and `-FfmpegPackageId`.
- [ ] Missing `winget` exits clearly with manual Node 20+, FFmpeg, and FFprobe
  instructions.
- [ ] Extension ID passed to setup matches the loaded extension ID.
- [ ] SBOM is generated for the setup archive and native helper package.
- [ ] License notices are included.
- [ ] Node, FFmpeg, and FFprobe are not bundled.
- [ ] Dependency installation is user-approved package-manager flow only.
- [ ] Setup and helper logs redact URLs, cookies, authorization headers, and
  other sensitive request context.
- [ ] Uninstall smoke test removes the native messaging registry entry.
- [ ] Popup onboarding fallback paths are tested for permission missing,
  permission denied, host missing, FFmpeg/FFprobe missing, ready, and error
  states.
- [ ] Signed MSI/WiX/Inno installer work remains out of scope for this beta.
