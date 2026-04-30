import { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import JSZip from 'jszip';
// ===== CONSTANTS =====
const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB (Extremely safe for 6MB Netlify payload limit)

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
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { showToast, ToastEl } = useToast();
  const [receiveCode, setReceiveCode] = useState('');

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles(prev => [...prev, ...Array.from(newFiles)]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toBase64Chunk = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      let uploadBlob: Blob;
      let finalFilename: string;

      if (files.length === 1) {
        uploadBlob = files[0];
        finalFilename = files[0].name;
      } else {
        setProgressLabel('ZIPPING FILES');
        const zip = new JSZip();
        files.forEach(f => zip.file(f.name, f));
        uploadBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
          setProgress(Math.round(metadata.percent * 0.1)); // First 10% for zipping
        });
        finalFilename = `LocalDrop_${files.length}_Files.zip`;
      }

      const dropId = Math.floor(100000 + Math.random() * 900000).toString();
      const totalChunks = Math.ceil(uploadBlob.size / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, uploadBlob.size);
        const chunk = uploadBlob.slice(start, end);
        const buffer = await chunk.arrayBuffer();
        const chunkData = toBase64Chunk(buffer);

        setProgressLabel(`UPLOADING: [${i + 1}/${totalChunks}]`);

        const res = await fetch('/api/upload-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkData, dropId, chunkIndex: i }),
          signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Chunk ${i} upload failed (HTTP ${res.status})`);
        }
        // Map 10% to 95% progress for upload
        setProgress(10 + Math.round(((i + 1) / totalChunks) * 85));
      }

      setProgressLabel('ASSEMBLING DATA');
      const finalRes = await fetch('/api/finalize-drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dropId,
          filename: finalFilename,
          size: uploadBlob.size,
          mimeType: uploadBlob.type || 'application/octet-stream',
          totalChunks,
        }),
        signal,
      });

      if (!finalRes.ok) throw new Error('Finalize failed');
      const { correctCode } = await finalRes.json();

      setProgress(100);

      const shareUrl = `${window.location.origin}/receive/${dropId}`;
      onDropCreated({
        dropId,
        correctCode,
        filename: finalFilename,
        size: uploadBlob.size,
        shareUrl,
        expiresAt: Date.now() + 15 * 60 * 1000,
      });
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        showToast('Upload terminated by user', 'info');
      } else {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        showToast(msg, 'error');
      }
      setUploading(false);
      setProgress(0);
    }
  };

  const handleCancelClick = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <>
      {/* SEND Section */}
      <div className="section-block">
        <div className="section-label">
          <span className="material-icons-round">cloud_upload</span>
          SEND A FILE
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />

        <div className="file-select-row">
          <button
            className={`file-select-btn ${files.length > 0 ? 'has-file' : ''}`}
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <span className="material-icons-round">
              {files.length > 0 ? 'library_add_check' : 'add_circle_outline'}
            </span>
            <span className="file-select-text">
              {files.length === 0 
                ? 'Choose files to share' 
                : files.length === 1 
                  ? files[0].name 
                  : `${files.length} Files Selected`}
            </span>
            {files.length > 0 && (
              <span className="file-select-size">{formatBytes(totalSize)}</span>
            )}
          </button>
          
          {files.length > 0 && !uploading && (
            <button 
              className="add-more-btn"
              onClick={() => inputRef.current?.click()}
              title="Add more files"
            >
              <span className="material-icons-round">add</span>
            </button>
          )}
        </div>

        {/* Establish button */}
        <button
          className="establish-btn"
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
        >
          <span className="material-icons-round" style={{ fontSize: 20 }}>
            {uploading ? 'sync' : 'bolt'}
          </span>
          {uploading ? 'UPLOADING...' : 'ESTABLISH DROP'}
        </button>

        {uploading && (
          <div className="upload-progress">
            <div className="progress-header">
              <div className="progress-header-left">
                <span className="progress-status-text">UPLOADING</span>
                <span className="progress-label">{progressLabel}</span>
              </div>
              <span className="progress-pct">{progress}%</span>
            </div>
            <div className="progress-track futuristic">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <button className="cancel-btn" onClick={handleCancelClick}>
              CANCEL TRANSFER
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="section-divider">
        <span className="divider-line" />
        <span className="divider-text">OR</span>
        <span className="divider-line" />
      </div>

      {/* RECEIVE Section */}
      <div className="section-block">
        <div className="section-label">
          <span className="material-icons-round">download</span>
          RECEIVE A FILE
        </div>
        <div className="receive-row">
          <input
            type="text"
            className="receive-input"
            placeholder="000000"
            value={receiveCode}
            onChange={(e) => setReceiveCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
          />
          <button
            className="receive-btn"
            onClick={() => { if (receiveCode.length === 6) window.location.href = `/receive/${receiveCode}` }}
            disabled={receiveCode.length !== 6 || uploading}
          >
            <span className="material-icons-round">arrow_forward</span>
            RECEIVE
          </button>
        </div>
        <p className="section-hint">Enter the 6-digit code shown on the sender's device</p>
      </div>

      {/* Transfer Activity */}
      {files.length > 0 && (
        <div className="vault-section">
          <div className="vault-header">
            <span className="vault-title">Transfer Activity</span>
            <span className="vault-count">{files.length} {files.length === 1 ? 'File' : 'Files'}</span>
          </div>
          <div className="file-list">
            {files.map((f, i) => {
              const cls = getFileIconClass(f.name);
              return (
                <div className="file-item" key={`${f.name}-${i}`}>
                  <div className={`file-item-icon ${cls}`}>
                    <span className="material-icons-round">{getFileIconName(cls)}</span>
                  </div>
                  <div className="file-item-info">
                    <div className="file-item-name" title={f.name}>{f.name}</div>
                    <div className="file-item-meta">{formatBytes(f.size)} • Ready</div>
                  </div>
                  {!uploading && (
                    <button className="file-remove" onClick={() => removeFile(i)}>
                      <span className="material-icons-round" style={{ fontSize: 18 }}>close</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
      {/* QR Code Section */}
      <div className="share-qr-section">
        <div className="qr-wrap">
          <QRCodeSVG
            value={info.shareUrl}
            size={160}
            bgColor="#ffffff"
            fgColor="#0F1724"
            level="H"
            includeMargin={true}
          />
        </div>
      </div>

      {/* Drop Code + Pin — side by side */}
      <div className="share-codes-row">
        <div className="share-code-card drop-code-card">
          <span className="share-code-label">DROP CODE</span>
          <span className="share-code-value drop-code-value">{info.dropId}</span>
          <span className="share-code-hint">Enter on receiver device</span>
        </div>
        <div className="share-code-card pin-code-card">
          <span className="share-code-label">SECURE PIN</span>
          <span className="share-code-value pin-code-value">{String(info.correctCode).padStart(2, '0')}</span>
          <span className="share-code-hint">Select from 4 options</span>
        </div>
      </div>

      {/* Share URL */}
      <div className="share-url-row">
        <div className="share-url">{info.shareUrl}</div>
        <button className="copy-btn" onClick={copy}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>
            {copied ? 'check' : 'content_copy'}
          </span>
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>

      {/* Active Drop Info */}
      <div className="vault-section">
        <div className="vault-header">
          <span className="vault-title">Active Drop</span>
          <span className="vault-count vault-expires">Expires in {expiresIn}m</span>
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

      {/* Terminate */}
      <button className="terminate-btn" onClick={onReset}>
        <span className="material-icons-round" style={{ fontSize: 18 }}>power_settings_new</span>
        TERMINATE SESSION
      </button>
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
        <p className="app-tagline">Secure & Instant File Transfer</p>

        <div className="feature-list">
          <div className="feature-pill"><span className="material-icons-round" style={{ fontSize: 16 }}>cloud_sync</span> Cloud Sharing</div>
          <div className="feature-pill"><span className="material-icons-round" style={{ fontSize: 16 }}>qr_code</span> QR Code</div>
          <div className="feature-pill"><span className="material-icons-round" style={{ fontSize: 16 }}>lock</span> PIN Secured</div>
          <div className="feature-pill"><span className="material-icons-round" style={{ fontSize: 16 }}>flash_on</span> Lightning Fast</div>
          <div className="feature-pill"><span className="material-icons-round" style={{ fontSize: 16 }}>devices</span> Cross-Device</div>
        </div>

        <div className="how-to-use">
          <h3 className="how-to-title">How to use?</h3>
          <div className="steps-container">
            <div className="step-item">
              <span className="step-num">1</span>
              <span className="step-text"><strong>Upload file</strong></span>
            </div>
            <div className="step-item">
              <span className="step-num">2</span>
              <span className="step-text"><strong>Establish Drop</strong></span>
            </div>
            <div className="step-item">
              <span className="step-num">3</span>
              <span className="step-text"><strong>Share code or scan QR</strong></span>
            </div>
            <div className="step-item">
              <span className="step-num">4</span>
              <span className="step-text"><strong>Enter Passcode</strong></span>
            </div>
            <div className="step-item final-step">
              <span className="step-icon material-icons-round">download_done</span>
              <span className="step-text final"><strong>Download starts automatically</strong></span>
            </div>
          </div>
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

      {/* Constraints Footer */}
      <div className="app-footer">
        <span className="material-icons-round">info</span>
        <span><strong>Network Constraints:</strong> Max ~500MB • 15 Minute Auto-Expiry • Do not close browser during upload</span>
      </div>
    </div>
  );
}
