import { useState } from 'react';

export interface DirectUrlSubmission {
  url: string;
  filename?: string;
  referer?: string;
  origin?: string;
}

export interface DirectUrlPanelResult {
  id: string;
  url: string;
  filename?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

interface DirectUrlPanelProps {
  results?: DirectUrlPanelResult[];
  onSubmit?: (input: DirectUrlSubmission) => void;
  onRetry?: (id: string) => void;
  onStop?: (id: string) => void;
}

const inputStyle = { padding: '6px 8px', fontSize: 13, width: '100%' };

export function DirectUrlPanel({ results = [], onSubmit, onRetry, onStop }: DirectUrlPanelProps) {
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [referer, setReferer] = useState('');
  const [origin, setOrigin] = useState('');

  return (
    <section aria-label="Manual download">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!url.trim() || !onSubmit) return;
          onSubmit({
            url: url.trim(),
            filename: filename.trim() || undefined,
            referer: referer.trim() || undefined,
            origin: origin.trim() || undefined,
          });
          setUrl('');
          setFilename('');
          setReferer('');
          setOrigin('');
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <label>
          URL
          <input
            aria-label="URL"
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label>
          Filename (optional)
          <input
            aria-label="Filename"
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label>
          Referer (optional)
          <input
            aria-label="Referer"
            value={referer}
            onChange={(event) => setReferer(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label>
          Origin (optional)
          <input
            aria-label="Origin"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            style={inputStyle}
          />
        </label>
        <button type="submit">Start download</button>
      </form>
      <ul aria-label="Direct URL results" style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
        {results.map((result) => (
          <li
            key={result.id}
            style={{
              padding: '6px 0',
              borderBottom: '1px solid var(--outline-variant, #2a2a2a)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <span style={{ flex: 1 }}>
              <strong>{result.filename ?? result.url}</strong>
              <span style={{ marginLeft: 8, opacity: 0.7 }}>{result.status}</span>
              {result.error ? <span style={{ marginLeft: 8, color: 'var(--error, #f87171)' }}>{result.error}</span> : null}
            </span>
            {result.status === 'failed' && onRetry ? (
              <button type="button" onClick={() => onRetry(result.id)}>
                Retry
              </button>
            ) : null}
            {(result.status === 'running' || result.status === 'pending') && onStop ? (
              <button type="button" onClick={() => onStop(result.id)}>
                Stop
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
