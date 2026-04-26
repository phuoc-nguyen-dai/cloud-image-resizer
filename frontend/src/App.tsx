import { useFileUpload } from "./hooks/useFileUpload";
import { Header } from "./components/Header";
import { DropZone } from "./components/DropZone";
import { ResultGallery } from "./components/ResultGallery";
import { AnimatePresence, motion } from "framer-motion";
import styles from "./App.module.css";

export default function App() {
  const { file, preview, state, result, selectFile, clearFile, upload } = useFileUpload();

  return (
    <div className={styles.root}>
      <Header />

      <div className={styles.layout}>
        {/* LEFT — Upload Panel */}
        <main className={styles.leftPanel} aria-label="Upload panel">
          {/* Panel heading */}
          <div className={styles.panelHeader}>
            <span className="accent-line" aria-hidden="true" />
            <div>
              <h1 className={styles.panelTitle}>Upload ảnh</h1>
              <p className={styles.panelSub}>
                Resize tự động thành{" "}
                <span className={styles.highlight}>640px</span> và{" "}
                <span className={styles.highlight}>1024px</span> trên Google Cloud
              </p>
            </div>
          </div>

          <DropZone
            file={file}
            preview={preview}
            state={state}
            onSelect={selectFile}
            onClear={clearFile}
            onUpload={upload}
          />
        </main>

        {/* RIGHT — Result Panel */}
        <aside className={styles.rightPanel} aria-label="Kết quả resize">
          <AnimatePresence mode="wait">
            {result ? (
              <ResultGallery
                key="result"
                result={result}
                filename={file?.name ?? "image"}
              />
            ) : (
              <motion.div
                key="empty"
                className={styles.emptyResult}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className={styles.emptyGrid} aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={styles.emptyCell} />
                  ))}
                </div>
                <p className={styles.emptyText}>
                  Kết quả sẽ xuất hiện<br />ở đây sau khi upload
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerLeft}>
          Cloud Image Resizer — Vite + React + GCS
        </span>
        <span className={styles.footerRight}>
          <span className={styles.dot} aria-label="Active" />
          API online
        </span>
      </footer>
    </div>
  );
}
