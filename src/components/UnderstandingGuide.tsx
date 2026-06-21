import {
  ArrowDown,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  FileCode2,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Wrench
} from "lucide-react";
import type { GuideContent } from "../i18n/guideContent";

const termIcons = [BrainCircuit, Bot, MessageSquareText, CheckCircle2, Sparkles, Wrench, Layers3, CircleDot];

export function UnderstandingGuide({ content, onOpenSource }: { content: GuideContent; onOpenSource: (href: string) => void }) {
  return (
    <article className="guide-page">
      <section className="guide-hero">
        <div className="guide-hero__copy">
          <p>{content.eyebrow}</p>
          <h2>{content.title}</h2>
          <span>{content.subtitle}</span>
          <div className="guide-verified"><ShieldCheck size={15} />{content.verified}</div>
        </div>
        <div className="guide-formula">
          <small>{content.formulaLead}</small>
          <div className="guide-formula__parts">
            {content.formulaParts.map((part, index) => (
              <span key={part}>{part}{index < content.formulaParts.length - 1 && <i>+</i>}</span>
            ))}
          </div>
          <strong><Bot size={22} />{content.formulaResult}</strong>
        </div>
      </section>

      <section className="guide-section">
        <GuideHeading title={content.flowTitle} description={content.flowIntro} />
        <div className="guide-flow">
          {content.flowSteps.map((step, index) => (
            <div className="guide-flow__item" key={step.title}>
              <div className="guide-flow__step"><span>{index + 1}</span><strong>{step.title}</strong><p>{step.description}</p></div>
              {index < content.flowSteps.length - 1 && <ArrowDown className="guide-flow__arrow" size={17} />}
            </div>
          ))}
        </div>
      </section>

      <section className="guide-section">
        <GuideHeading title={content.termsTitle} description={content.termsIntro} />
        <div className="guide-terms">
          {content.terms.map(({ term, definition }, index) => {
            const Icon = termIcons[index % termIcons.length];
            return <div className="guide-term" key={term}><div><Icon size={17} /></div><strong>{term}</strong><p>{definition}</p></div>;
          })}
        </div>
      </section>

      <section className="guide-section">
        <GuideHeading title={content.chaptersTitle} description={content.chaptersIntro} />
        <div className="guide-chapters">
          {content.chapters.map((chapter) => (
            <details className="guide-chapter" key={chapter.number}>
              <summary>
                <span>{chapter.number}</span>
                <div><strong>{chapter.title}</strong><p>{chapter.summary}</p></div>
                <i>+</i>
              </summary>
              <div className="guide-chapter__body">
                <ul>{chapter.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                {chapter.note && <div className="guide-chapter__note"><CheckCircle2 size={16} /><span>{chapter.note}</span></div>}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="guide-sources">
        <div><FileCode2 size={20} /><span><strong>{content.sourcesTitle}</strong><small>{content.sourcesIntro}</small></span></div>
        <nav>
          {content.sources.map((source) => <button type="button" onClick={() => onOpenSource(source.href)} key={source.href}>{source.label}</button>)}
        </nav>
      </section>
    </article>
  );
}

function GuideHeading({ title, description }: { title: string; description: string }) {
  return <div className="guide-heading"><h3>{title}</h3><p>{description}</p></div>;
}
