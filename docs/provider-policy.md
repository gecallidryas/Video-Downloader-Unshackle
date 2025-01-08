# Provider Policy

The downloader has a strict protected-media boundary:

- Protected candidates are blocked by default.
- DRM and unknown-protection candidates cannot use the generic downloader.
- Provider workflows must be registered explicitly.
- Provider workflows never unlock generic downloads.
- The UI must require user acknowledgement before showing a provider-authorized
  proceed action.

## Where Policy Lives

- `src/core/policy/provider-registry.ts` defines the explicit registry shape and
  the default production registry.
- `src/core/policy/evaluate-provider-policy.ts` evaluates a `MediaCandidate`
  against the registry.
- `src/ui/protected/ProtectedActionGate.tsx` renders blocked copy or the
  acknowledgement-gated provider workflow.
- `src/background/messaging/runtime-router.ts` rejects protected candidates from
  `START_DOWNLOAD`.
- `src/app/surfaces/sidepanel/SidePanelApp.tsx` evaluates provider policy for
  protected candidate cards.

## Default Registry

The default production registry is empty:

```ts
export const providerRegistry: ProviderRegistry = [];
```

This is intentional. The project must not ship generic mock provider data or
site-specific bypass behavior. A provider entry is only appropriate when there is
an authorized user workflow that stays outside the generic downloader engine.

## Registry Entry Contract

A provider registry entry contains:

- `id`: stable provider identifier.
- `providerName`: user-facing provider name.
- `origins`: exact origins the workflow applies to.
- `actionLabel`: acknowledgement-gated action text.
- `acknowledgement`: text the user must affirm before proceeding.
- `getProceedUrl(candidate)`: returns the provider workflow URL for the
  candidate, or `undefined` to keep the candidate blocked.

## Evaluation Rules

`evaluateProviderPolicy(candidate)` returns one of:

- `blocked`: no authorized workflow is available.
- `authorized-workflow`: the candidate origin matched a provider registry entry
  and the entry returned a proceed URL.

The evaluator normalizes origins before matching. Non-protected candidates do
not receive a provider workflow result because normal downloads are handled by
the protocol engines.

## UI Rules

The protected action gate must:

- show blocked copy when no provider workflow matches
- show the provider name when a workflow matches
- require the acknowledgement checkbox before rendering the proceed button
- call the provider proceed handler only after acknowledgement

The gate must not:

- render a generic `Download` button for protected media
- imply DRM or protected playback can be bypassed
- use production mock provider entries

## Test Coverage

Provider policy is covered by:

```bash
npm test -- src/core/policy/__tests__/evaluate-provider-policy.test.ts src/ui/protected/__tests__/ProtectedActionGate.test.tsx
```

The tests verify:

- protected candidates are blocked by default
- matching provider entries expose an acknowledgement-gated proceed path
- non-matching origins remain blocked

