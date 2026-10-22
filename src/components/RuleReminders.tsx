import { ruleReminders as reminders } from '../content/playingRules';
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../rule-reminders.css';

export function RuleReminders({ display = false }: { display?: boolean }) {
  return (
    <section className="rule-reminders" aria-label="Rules to remember">
      <header>
        <h2>
          <BookOpen size={18} /> Rules to remember
        </h2>
        <Link className="text-link" to={display ? '/rules?from=display' : '/rules'}>
          Full rules
        </Link>
      </header>
      <div className="rule-reminders-content">
        <ol>
          {(display ? reminders : reminders.slice(0, 4)).map((rule) => (
            <li key={rule.title}>
              <h3>{rule.title}</h3>
              <p>{rule.text}</p>
            </li>
          ))}
        </ol>
        {display && (
          <a
            className="rule-rack"
            href="/images/rack_layout.png"
            target="_blank"
            rel="noreferrer"
            aria-label="Open the pool rack layout"
          >
            <img
              src="/images/rack_layout.png"
              alt="Pool rack: red at the apex, black in the centre of the third row; full colour arrangement shown."
            />
          </a>
        )}
      </div>
    </section>
  );
}
