import styles from "./Header.module.css";

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect x="0" y="0" width="28" height="28" fill="var(--orange)" />
          <path d="M7 18 L14 8 L21 18" stroke="var(--black)" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" fill="none"/>
          <rect x="10" y="14" width="8" height="6" fill="var(--black)" />
        </svg>
        <span className={styles.logoText}>RESIZER</span>
      </div>
      <div className={styles.meta}>
        <span className={styles.badge}>Powered by GCP</span>
      </div>
    </header>
  );
}
