import { useCallback, useRef } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { UploadState } from "../hooks/useFileUpload";
import styles from "./DropZone.module.css";

interface Props {
  file: File | null;
  preview: string;
  state: UploadState;
  onSelect: (f: File) => void;
  onClear: () => void;
  onUpload: () => void;
}

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function DropZone({ file, preview, state, onSelect, onClear, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDragging = useRef(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onSelect(f);
  }, [onSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onSelect(f);
  }, [onSelect]);

  const isUploading = state.phase === "uploading" || state.phase === "requesting-url" || state.phase === "processing";
  const isDone = state.phase === "done";

  return (
    <div className={styles.wrapper}>
      {/* Upload Zone */}
      <div
        className={`${styles.zone} ${isUploading ? styles.zoneActive : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={() => { isDragging.current = true; }}
        onDragLeave={() => { isDragging.current = false; }}
        onClick={() => !file && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload zone — drag and drop or click to select image"
        onKeyDown={(e) => e.key === "Enter" && !file && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED.join(",")}
          onChange={handleChange}
          className={styles.hiddenInput}
          aria-label="File input"
          id="file-input"
        />

        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div
              key="empty"
              className={styles.emptyState}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={styles.uploadIcon}>
                <Upload size={40} strokeWidth={1.5} />
              </div>
              <h2 className={styles.dropTitle}>Kéo ảnh vào đây</h2>
              <p className={styles.dropSub}>hoặc click để chọn file</p>
              <div className={styles.formatLine}>
                <span className={styles.formatTag}>JPEG</span>
                <span className={styles.formatTag}>PNG</span>
                <span className={styles.formatTag}>WebP</span>
                <span className={styles.formatTag}>GIF</span>
                <span className={styles.formatNote}>tối đa 10MB</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              className={styles.previewState}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div className={styles.previewImgWrap}>
                {preview ? (
                  <img src={preview} alt="Preview" className={styles.previewImg} />
                ) : (
                  <ImageIcon size={48} strokeWidth={1} />
                )}
              </div>
              <div className={styles.previewMeta}>
                <span className={styles.previewName}>{file.name}</span>
                <span className={styles.previewSize}>
                  {file.size < 1024 * 1024
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {state.phase === "error" && state.error && (
          <motion.div
            className={styles.errorBox}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className={styles.errorDot} aria-hidden="true" />
            <span>{state.error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            className={styles.progressWrap}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className={styles.progressHeader}>
              <span className={styles.progressStatus}>{state.statusText}</span>
              <span className={styles.progressPct}>{state.progress}%</span>
            </div>
            <div className={styles.progressTrack} role="progressbar" aria-valuenow={state.progress} aria-valuemin={0} aria-valuemax={100}>
              <motion.div
                className={styles.progressBar}
                animate={{ width: `${state.progress}%` }}
                transition={{ ease: "easeOut", duration: 0.4 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA Buttons */}
      <div className={styles.actions}>
        {file && !isUploading && !isDone && (
          <>
            <button
              className={styles.btnPrimary}
              onClick={onUpload}
              disabled={isUploading}
              aria-label="Upload và resize ảnh"
              id="upload-btn"
            >
              <Upload size={16} strokeWidth={2} />
              Upload &amp; Resize
            </button>
            <button
              className={styles.btnGhost}
              onClick={onClear}
              aria-label="Hủy và chọn ảnh khác"
            >
              Hủy
            </button>
          </>
        )}
        {isDone && (
          <button
            className={styles.btnGhost}
            onClick={onClear}
            aria-label="Upload ảnh khác"
          >
            Upload ảnh khác →
          </button>
        )}
        {!file && (
          <button
            className={styles.btnPrimary}
            onClick={() => inputRef.current?.click()}
            aria-label="Chọn ảnh để upload"
            id="select-btn"
          >
            Chọn ảnh
          </button>
        )}
      </div>
    </div>
  );
}
