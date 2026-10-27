import { ruleSections as sections } from '../content/playingRules';
import { ArrowLeft, ArrowUpRight, BookOpen, Monitor } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../components/ui';

export function Rules() {
  const [params] = useSearchParams();
  const fromDisplay = params.get('from') === 'display';
  return (
    <div className={`rules-page${fromDisplay ? ' rules-from-display' : ''}`}>
      <a className="skip-link" href="#rules-content">
        Skip to rules
      </a>
      <header className="rules-header">
        <Link to={fromDisplay ? '/display' : '/'} aria-label="Virtuoso Pool League home">
          <img src="/brand/virtuoso-gradient.png" alt="Virtuoso" />
          <span>POOL LEAGUE</span>
        </Link>
        <Link className="button secondary" to={fromDisplay ? '/display' : '/'}>
          {fromDisplay ? <Monitor size={18} /> : <ArrowLeft size={18} />}
          {fromDisplay ? 'Back to TV display' : 'Back to league'}
        </Link>
      </header>
      <main id="rules-content" className="rules-content">
        <PageHeading
          eyebrow="PLAYING RULES"
          title="Virtuoso Pool League — Rules"
          description="Summary of the EPA-hosted WEPF World Rules poster (abridged January 2020)."
        />
        <div className="rules-layout">
          <nav className="rules-contents panel" aria-label="Rules contents">
            <h2>
              <BookOpen size={18} /> At the table
            </h2>
            <ol>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
            <p>
              A quick reference for our league. For detailed rulings and exceptions, see the
              official source below.
            </p>
          </nav>
          <div className="rules-sections">
            {sections.map((s, i) => (
              <section
                className="panel rules-section"
                id={s.id}
                key={s.id}
                aria-labelledby={`${s.id}-heading`}
              >
                <h2 id={`${s.id}-heading`}>
                  <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  {s.title}
                </h2>
                {s.introduction && <p>{s.introduction}</p>}
                {s.listLabel && (
                  <p>
                    <strong>{s.listLabel}</strong>
                  </p>
                )}
                <ul>
                  {s.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
            <footer className="panel rules-source">
              <h2>The official rulebook</h2>
              <p>WEPF World Rules · EPA poster · Abridged January 2020</p>
              <a
                className="text-link"
                href="https://epa.org.uk/images/rules/Pool%20Rules%20B3%20poster%20Oct%2019.pdf"
                target="_blank"
                rel="noreferrer"
              >
                Read the official rules (PDF, opens in a new tab)
                <ArrowUpRight size={17} />
              </a>
              <Link className="button secondary" to={fromDisplay ? '/display' : '/'}>
                <ArrowLeft size={17} />
                {fromDisplay ? 'Back to TV display' : 'Back to league'}
              </Link>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}
