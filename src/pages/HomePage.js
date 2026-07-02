import { useCallback, useEffect, useRef, useState } from "react";

const REDIRECT_URL = "https://www.stewmore.dev";
const COUNTDOWN_SECONDS = 5;

// Circle geometry for the animated countdown ring.
const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function HomePage() {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const redirectedRef = useRef(false);

  const goToSite = useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    window.location.href = REDIRECT_URL;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);

    const timeout = setTimeout(goToSite, COUNTDOWN_SECONDS * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [goToSite]);

  return (
    <div className="redirect-page">
      <div className="redirect-bg" aria-hidden="true" />

      <main className="redirect-card">
        <span className="redirect-logo">SM</span>

        <h1 className="redirect-title">
          We&rsquo;ve <span className="redirect-gradient">moved</span>
        </h1>

        <p className="redirect-subtitle">
          Stewart Moreland&rsquo;s site now lives at a new home.
          <br />
          Taking you to{" "}
          <span className="redirect-domain">www.stewmore.dev</span>
        </p>

        <div className="redirect-ring" role="timer" aria-live="polite">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <defs>
              <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4f9fff" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
            <circle
              className="redirect-ring-track"
              cx="70"
              cy="70"
              r={RING_RADIUS}
            />
            <circle
              className="redirect-ring-progress"
              cx="70"
              cy="70"
              r={RING_RADIUS}
              style={{
                strokeDasharray: RING_CIRCUMFERENCE,
                strokeDashoffset: 0,
              }}
            />
          </svg>
          <span className="redirect-count">{secondsLeft}</span>
        </div>

        <button type="button" className="redirect-button" onClick={goToSite}>
          Continue to www.stewmore.dev
          <span className="redirect-button-arrow" aria-hidden="true">
            &rarr;
          </span>
        </button>

        <p className="redirect-hint">
          You&rsquo;ll be redirected automatically.
        </p>
      </main>
    </div>
  );
}
