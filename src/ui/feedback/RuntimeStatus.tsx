import type { PanelSurfaceState } from '@/src/types/ui-state';

interface RuntimeStatusProps {
  surfaceState: PanelSurfaceState;
  errorMessage: string | null;
}

export function RuntimeStatus({
  surfaceState,
  errorMessage,
}: RuntimeStatusProps) {
  switch (surfaceState) {
    case 'detecting':
      return <p>Detecting media on this page</p>;
    case 'empty':
      return <p>No media detected on this page</p>;
    case 'error':
      return <p>{errorMessage ?? 'Something went wrong while inspecting this page'}</p>;
    case 'protected_only':
      return (
        <div>
          <p>Protected media detected</p>
          <p>Proceed only if you have explicit permission from the content owner or service.</p>
        </div>
      );
    case 'disabled':
      return <p>Automatic detection is currently disabled</p>;
    default:
      return null;
  }
}
