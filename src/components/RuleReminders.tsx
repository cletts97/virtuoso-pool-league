import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../rule-reminders.css';

const reminders = [
  {
    title: "Potting an opponent's ball",
    text: "Potting your opponent's ball is a foul, even if you hit your own colour first.",
  },
  {
    title: 'Cushion rule',
    text: 'After hitting your own colour, a ball must be potted or any ball (including the white) must hit a cushion.',
  },
  {
    title: 'Foul snooker',
    text: 'If your opponent fouls and leaves you snookered, you are able to nominate another ball to hit first, subject to the foul-snooker rules.',
  },
  {
    title: 'Playing from baulk',
    text: 'You can shoot in any direction, including backwards, when playing from behind the baulk line.',
  },
];

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
      <ol>
        {reminders.map((rule) => (
          <li key={rule.title}>
            <h3>{rule.title}</h3>
            <p>{rule.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
