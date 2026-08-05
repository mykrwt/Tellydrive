"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="error-page"><div><span>!</span><h1>Something went wrong</h1><p>The account service could not complete that request.</p><button onClick={reset}>Try again</button></div></main>;
}
