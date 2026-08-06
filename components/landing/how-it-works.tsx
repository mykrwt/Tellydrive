const steps = [
  {
    num: "01",
    title: "Create your account",
    body: "Sign up and your private vault appears instantly.",
  },
  {
    num: "02",
    title: "Drop anything in",
    body: "Drag, drop, done. Big files welcome.",
  },
  {
    num: "03",
    title: "Reach it anywhere",
    body: "Any device, any time. Always synced.",
  },
];

export function HowItWorks() {
  return (
    <section className="landing-section section-tinted" id="how-it-works">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">How it works</p>
          <h2>Set up in a minute.</h2>
          <p>No installers, no sync clients. It just works.</p>
        </div>
        <div className="steps">
          {steps.map((step) => (
            <article className="step-card reveal" key={step.num}>
              <span className="step-num">{step.num}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
        <p className="steps-note reveal">Powered by Telegram&apos;s cloud infrastructure.</p>
      </div>
    </section>
  );
}
