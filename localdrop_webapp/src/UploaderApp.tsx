import { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { v4 as uuidv4 } from 'uuid';

// ===== CONSTANTS =====
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB to stay safely under 6MB limit

// ===== TYPES =====
type AppView = 'upload' | 'share';

interface DropInfo {
  dropId: string;
  correctCode: number;
  filename: string;
  size: number;
  shareUrl: string;
  expiresAt: number;
}

// ===== HELPERS =====
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1000;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIconClass(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archive';
  return 'default';
}

function getFileIconName(cls: string): string {
  switch (cls) {
    case 'image': return 'image';
    case 'video': return 'play_circle';
    case 'archive': return 'folder_zip';
    default: return 'insert_drive_file';
  }
}

function useToast() {
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info'; show: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, kind: 'success' | 'error' | 'info' = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind, show: true });
    timer.current = setTimeout(() => setToast(t => (t ? { ...t, show: false } : null)), 3000);
  };

  const ToastEl = toast ? (
    <div className={`toast ${toast.kind} ${toast.show ? 'show' : ''}`}>
      <span className="material-icons-round">
        {toast.kind === 'success' ? 'check_circle' : toast.kind === 'error' ? 'error' : 'info'}
      </span>
      {toast.msg}
    </div>
  ) : null;

  return { showToast, ToastEl };
}

// ===== UPLOAD COMPONENT =====
function UploadPage({ onDropCreated }: { onDropCreated: (info: DropInfo) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast, ToastEl } = useToast();

  const handleFile = (f: File) => setFile(f);

  const toBase64Chunk = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);

    try {
      const dropId = uuidv4();
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const buffer = await chunk.arrayBuffer();
        const chunkData = toBase64Chunk(buffer);

        setProgressLabel(`Uploading chunk ${i + 1} of ${totalChunks}...`);

        const res = await fetch('/api/upload-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkData, dropId, chunkIndex: i }),
        });

        if (!res.ok) throw new Error(`Chunk ${i} upload failed`);
        setProgress(Math.round(((i + 1) / totalChunks) * 85));
      }

      setProgressLabel('Finalizing drop...');
      const finalRes = await fetch('/api/finalize-drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dropId,
          filename: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          totalChunks,
        }),
      });

      if (!finalRes.ok) throw new Error('Finalize failed');
      const { correctCode } = await finalRes.json();

      setProgress(100);

      const shareUrl = `${window.location.origin}/receive/${dropId}`;
      onDropCreated({
        dropId,
        correctCode,
        filename: file.name,
        size: file.size,
        shareUrl,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      showToast(msg, 'error');
      setUploading(false);
      setProgress(0);
    }
  };

  const iconClass = file ? getFileIconClass(file.name) : 'default';
  const iconName = getFileIconName(iconClass);

  return (
    <>
      <div className="browser-card">
        <span className="card-label">Connection Manager</span>
        <div className="url-display" title={window.location.host}>
          {window.location.host}
        </div>
        <button
          className="establish-btn"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? 'UPLOADING...' : 'ESTABLISH DROP'}
        </button>

        {uploading && (
          <div className="upload-progress" style={{ marginTop: 24 }}>
            <div className="progress-header">
              <span className="progress-label">{progressLabel}</span>
              <span className="progress-pct">{progress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="action-row">
        <input
          ref={inputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <button
          className={`action-btn btn-share ${file ? 'active' : ''}`}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <span className="material-icons-round">upload_file</span>
          <span className="btn-label">SHARE FILE</span>
        </button>

        <button
          className="action-btn btn-receive"
          onClick={() => (window.location.href = '/')}
          disabled={uploading}
        >
          <span className="material-icons-round">download_for_offline</span>
          <span className="btn-label">RECEIVE FILE</span>
        </button>
      </div>

      <div className="vault-section">
        <div className="vault-header">
          <span className="vault-title">Transfer Activity</span>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{file ? '1 File' : '0 Files'}</span>
        </div>

        <div className="file-list">
          {!file ? (
            <div className="empty-state">
              <span className="material-icons-round">inbox</span>
              <div>Waiting for files...</div>
            </div>
          ) : (
            <div className="file-item">
              <div className={`file-item-icon ${iconClass}`}>
                <span className="material-icons-round">{iconName}</span>
              </div>
              <div className="file-item-info">
                <div className="file-item-name" title={file.name}>{file.name}</div>
                <div className="file-item-meta">{formatBytes(file.size)} • Ready</div>
              </div>
              {!uploading && (
                <button className="file-remove" onClick={() => setFile(null)}>
                  <span className="material-icons-round" style={{ fontSize: 18 }}>close</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {ToastEl}
    </>
  );
}

// ===== SHARE COMPONENT =====
function SharePage({ info, onReset }: { info: DropInfo; onReset: () => void }) {
  const { showToast, ToastEl } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.shareUrl);
      setCopied(true);
      showToast('Link copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Copy failed', 'error');
    }
  };

  const expiresIn = Math.max(0, Math.round((info.expiresAt - Date.now()) / 60000));

  return (
    <>
      <div className="browser-card" style={{ background: 'var(--bg-card)' }}>
        <span className="card-label">Connection Manager</span>
        <div className="url-display" title={info.shareUrl}>
          {info.shareUrl}
        </div>
        <div
          className="qr-wrap"
          style={{ margin: '0 auto 24px', width: 'fit-content' }}
        >
          <QRCodeSVG
            value={info.shareUrl}
            size={180}
            bgColor="#ffffff"
            fgColor="#0F1724"
            level="H"
            includeMargin={true}
          />
        </div>

        <div className="pin-display-box">
          <div className="card-label">RECIPIENT SECURE CODE</div>
          <div className="pin-code">{String(info.correctCode).padStart(2, '0')}</div>
          <p className="text-muted" style={{ fontSize: 12 }}>
            Receiver must select this number among 4 options.
          </p>
        </div>

        <div className="share-url-row">
          <div className="share-url">{info.shareUrl}</div>
          <button className="copy-btn" onClick={copy}>
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
      </div>

      <button className="btn-primary" onClick={onReset}>
        TERMINATE SESSION
      </button>

      <div className="vault-section" style={{ marginTop: 24 }}>
        <div className="vault-header">
          <span className="vault-title">Active Drop</span>
          <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>Expires in {expiresIn}m</span>
        </div>
        <div className="file-item">
          <div className="file-item-icon">
            <span className="material-icons-round">cloud_done</span>
          </div>
          <div className="file-item-info">
            <div className="file-item-name">{info.filename}</div>
            <div className="file-item-meta">{formatBytes(info.size)} • Live</div>
          </div>
        </div>
      </div>
      {ToastEl}
    </>
  );
}

// ===== MAIN UPLOADER APP =====
export default function UploaderApp() {
  const [view, setView] = useState<AppView>('upload');
  const [dropInfo, setDropInfo] = useState<DropInfo | null>(null);

  const handleDropCreated = (info: DropInfo) => {
    setDropInfo(info);
    setView('share');
  };



  return (
    <div className="app-layout">
      {/* LEFT PANEL: Branding & Status */}
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

      {/* RIGHT PANEL: Functional Content */}
      <div className="right-panel">
        {view === 'upload' ? (
          <UploadPage onDropCreated={handleDropCreated} />
        ) : (
          dropInfo && (
            <SharePage
              info={dropInfo}
              onReset={() => {
                setDropInfo(null);
                setView('upload');
              }}
            />
          )
        )}
      </div>
    </div>
  );
}
