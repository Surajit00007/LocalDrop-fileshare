import { useEffect, useState } from 'react';

// ===== TYPES =====
interface DropMeta {
  filename: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  options: number[];
  expiresAt: number;
}

type ReceiveState = 'loading' | 'awaiting' | 'correct' | 'wrong' | 'downloading' | 'done' | 'error';

// ===== HELPERS =====
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1000;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIconName(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'play_circle';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'folder_zip';
  return 'insert_drive_file';
}

// ===== RECEIVE PAGE =====
export default function ReceiveApp({ dropId }: { dropId: string }) {
  const [meta, setMeta] = useState<DropMeta | null>(null);
  const [state, setState] = useState<ReceiveState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedCode, setSelectedCode] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    fetch(`/api/get-drop?dropId=${encodeURIComponent(dropId)}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(j.error || 'Failed to load drop');
        }
        return r.json();
      })
      .then((data: DropMeta) => {
        setMeta(data);
        setState('awaiting');
      })
      .catch(err => {
        setErrorMsg(err.message);
        setState('error');
      });
  }, [dropId]);

  const handlePinSelect = async (code: number) => {
    if (state !== 'awaiting' || !meta) return;
    setSelectedCode(code);
    setState('downloading');
    setDownloadProgress(2);

    try {
      const chunks: ArrayBuffer[] = [];
      const total = meta.totalChunks;

      for (let i = 0; i < total; i++) {
        const res = await fetch('/api/download-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dropId, selectedCode: code, chunkIndex: i }),
        });

        if (res.status === 403) {
          setState('wrong');
          setTimeout(() => {
            setState('awaiting');
            setSelectedCode(null);
          }, 1200);
          return;
        }

        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: 'Download failed' }));
          throw new Error(j.error || 'Download failed');
        }

        const json = await res.json();
        const base64 = json.data;
        const binString = atob(base64);
        const len = binString.length;
        const bytes = new Uint8Array(len);
        for (let j = 0; j < len; j++) bytes[j] = binString.charCodeAt(j);
        chunks.push(bytes.buffer);

        setDownloadProgress(Math.round(((i + 1) / total) * 100));
      }

      setState('correct'); // Brief success state

      // Reconstruct blob and trigger download
      const blob = new Blob(chunks, { type: meta.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.filename || 'download';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);

      setState('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMsg(msg);
      setState('error');
    }
  };

  // ===== RENDER HELPERS =====
  const renderBranding = () => (
    <div className="left-panel">
      <div className="hero-section">
        <div className="hero-circle">
          <span className="material-icons-round hero-icon">bolt</span>
        </div>
      </div>

      <h1 className="app-title">Local Drop</h1>
      <p className="app-tagline">Local Drop — Secure Transfer</p>

      <div className="feature-list">
        <div className="feature-pill">Cloud Sharing</div>
        <div className="feature-pill">QR CODE Sharing</div>
      </div>
    </div>
  );

  // ===== RENDER STATES =====
  return (
    <div className="app-layout">
      {renderBranding()}

      <div className="right-panel">
        {state === 'loading' && (
          <div className="loading-state" style={{ textAlign: 'center', padding: '40px' }}>
            <div className="spinner" style={{ margin: '0 auto 20px' }} />
            <p>Loading drop info...</p>
          </div>
        )}

        {state === 'error' && (
          <div className="error-state">
            <div className="error-icon">
              <span className="material-icons-round">link_off</span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Drop Unavailable</h2>
            <p className="text-muted">{errorMsg}</p>
            <button className="btn btn-ghost" style={{ marginTop: 20 }} onClick={() => (window.location.href = '/')}>
              <span className="material-icons-round">home</span>
              Go Home
            </button>
          </div>
        )}

        {state === 'done' && (
          <div className="success-state">
            <div className="success-icon">
              <span className="material-icons-round">download_done</span>
            </div>
            <h2 className="success-title">Download Complete!</h2>
            <p className="success-sub">Your file has been saved to your device.</p>
            <button className="btn btn-primary" onClick={() => (window.location.href = '/')}>
              <span className="material-icons-round">add_circle</span>
              Drop a File
            </button>
          </div>
        )}

        {(state === 'awaiting' || state === 'wrong' || state === 'correct' || state === 'downloading') && (
          <>
            {/* File Info Card */}
            {meta && (
              <div className="receive-file-card" style={{ marginBottom: 24, textAlign: 'center' }}>
                <div className="receive-file-icon" style={{ margin: '0 auto 16px' }}>
                  <span className="material-icons-round">{getFileIconName(meta.filename)}</span>
                </div>
                <div className="receive-filename" style={{ fontWeight: 700, fontSize: 18 }} title={meta.filename}>
                  {meta.filename}
                </div>
                <div className="receive-meta" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {formatBytes(meta.size)}
                </div>
              </div>
            )}

            {/* PIN Selection */}
            {(state === 'awaiting' || state === 'wrong') && (
              <div className="card-inner">
                <p className="pin-section-title" style={{ textAlign: 'center', marginBottom: 16 }}>
                  {state === 'wrong' ? '❌ Wrong PIN — try again' : '🔐 Select the code shown by the sender'}
                </p>
                <div className="pin-grid">
                  {meta?.options.map((code) => (
                    <button
                      key={code}
                      className={`pin-btn ${state === 'wrong' && code === selectedCode ? 'wrong' : ''}`}
                      onClick={() => handlePinSelect(code)}
                    >
                      <span>{String(code).padStart(2, '0')}</span>
                    </button>
                  ))}
                </div>
                <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 16 }}>
                  Only the correct number will unlock the file
                </p>
              </div>
            )}

            {(state === 'correct' || state === 'downloading') && (
              <div className="loading-state" style={{ textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '20px auto' }} />
                <p>Verifying & downloading...</p>
                {downloadProgress > 0 && (
                  <div className="upload-progress" style={{ marginTop: 24 }}>
                    <div className="progress-header">
                      <span className="progress-label">Downloading</span>
                      <span className="progress-pct">{downloadProgress}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${downloadProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
