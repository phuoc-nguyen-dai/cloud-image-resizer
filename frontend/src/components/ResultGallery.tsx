import { useState } from "react";
import { ExternalLink, Copy, Check, ZoomIn } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ResizedResult } from "../hooks/useFileUpload";
import { SIZE_LABELS } from "../config";
import styles from "./ResultGallery.module.css";

interface Props {
  result: ResizedResult;
  filename: string;
}

interface CardProps {
  width: string;
  url: string;
  index: number;
}

function ImageCard({ width, url, index }: CardProps) {
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const label = SIZE_LABELS[Number(width)] ?? `${width}px`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard error
    }
  };

  return (
    <>
      <motion.article
        className={styles.card}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        aria-label={`Ảnh ${width}px`}
      >
        {/* Header bar */}
        <div className={styles.cardTop}>
          <span className={styles.sizeLabel}>{label}</span>
          <span className={styles.sizePx}>{width}px</span>
        </div>

        {/* Image */}
        <div className={styles.imgWrap} onClick={() => setLightbox(true)} role="button" tabIndex={0}
          aria-label={`Xem ảnh ${width}px toàn màn hình`}
          onKeyDown={(e) => e.key === "Enter" && setLightbox(true)}>
          <img
            src={url}
            alt={`Ảnh đã resize ${width}px`}
            className={styles.img}
            loading="lazy"
          />
          <div className={styles.imgOverlay} aria-hidden="true">
            <ZoomIn size={20} strokeWidth={1.5} />
          </div>
        </div>

        {/* Actions */}
        <div className={styles.cardActions}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnOpen}
            aria-label={`Mở ảnh ${width}px trong tab mới`}
          >
            <ExternalLink size={14} strokeWidth={2} />
            Mở
          </a>
          <button
            className={styles.btnCopy}
            onClick={copy}
            aria-label={`Copy URL ảnh ${width}px`}
          >
            {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2} />}
            {copied ? "Đã copy!" : "Copy URL"}
          </button>
        </div>
      </motion.article>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            className={styles.lightbox}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(false)}
            role="dialog"
            aria-label="Xem ảnh toàn màn hình"
          >
            <motion.img
              src={url}
              alt={`Ảnh ${width}px fullsize`}
              className={styles.lightboxImg}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ ease: [0.34, 1.56, 0.64, 1], duration: 0.35 }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className={styles.lightboxClose}
              onClick={() => setLightbox(false)}
              aria-label="Đóng"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function ResultGallery({ result, filename }: Props) {
  const entries = Object.entries(result.sizes).sort(([a], [b]) => Number(a) - Number(b));

  return (
    <motion.section
      className={styles.gallery}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Kết quả resize"
    >
      {/* Section header */}
      <div className={styles.galleryHeader}>
        <span className="accent-line" aria-hidden="true" />
        <div>
          <h2 className={styles.galleryTitle}>Kết quả</h2>
          <p className={styles.galleryMeta}>
            <span className={styles.mono}>{filename}</span>
            {" · "}
            {entries.length} phiên bản
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        {entries.map(([width, url], i) => (
          <ImageCard key={width} width={width} url={url} index={i} />
        ))}
      </div>

      <p className={styles.timestamp}>
        Xử lý lúc{" "}
        {new Date(result.processedAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </p>
    </motion.section>
  );
}
