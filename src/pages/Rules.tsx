import { ArrowLeft, ArrowUpRight, BookOpen, Monitor } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../components/ui';

// League-owner supplied playing rules. Competition scoring remains in domain/rules.ts.
const sections = [
  {
    id: 'starting',
    title: 'Starting the game',
    items: [
      'The game is played with 7 reds, 7 yellows, a black and a white cue ball.',
      'Break from behind the baulk line.',
      'A legal break must pot at least one coloured ball OR cause at least four object balls to hit a cushion.',
      'If the black is potted on the break, re-rack and the same player breaks again.',
      'If the white is potted on a legal break, the opponent takes the next turn from baulk, without two visits.',
      'Colours are decided according to the first legally potted balls and any required colour nomination.',
    ],
  },
  {
    id: 'normal-play',
    title: 'Normal play',
    items: [
      'You must hit one of your own colours first.',
      'After contact, a ball must be potted OR any ball must hit a cushion.',
      'You continue your visit while legally potting your own colours.',
      "If you don't pot a ball but make a legal shot, your turn ends.",
      "Potting an opponent's ball is a foul, even if your own ball was hit first.",
      'You must pot all your colours before attempting to pot the black.',
    ],
  },
  {
    id: 'fouls',
    title: 'Fouls — two visits to your opponent',
    introduction: 'The following are standard fouls:',
    items: [
      'Potting the white ball.',
      "Hitting your opponent's colour first.",
      'Failing to hit any ball.',
      'Hitting your own ball but failing to pot a ball or reach a cushion.',
      "Potting your opponent's ball.",
      'Touching or moving a ball accidentally.',
      'Playing a push shot or double hit.',
      'Playing a shot with both feet off the floor.',
      'Knocking a ball off the table.',
      'Playing out of turn.',
    ],
  },
  {
    id: 'after-a-foul',
    title: 'What happens after a foul?',
    items: [
      'Your opponent receives two visits for a standard foul.',
      'If the white was potted, your opponent plays from behind the baulk line.',
      'Otherwise, the white generally stays where it stopped.',
      'The first visit ends when you fail to legally pot a ball.',
      'You then begin your second visit.',
      'A foul during either visit ends your turn and gives your opponent the appropriate foul penalty.',
    ],
  },
  {
    id: 'baulk',
    title: 'Playing from behind the line',
    items: [
      'The centre of the white must be behind the baulk line.',
      'The white can be positioned anywhere within baulk.',
      'Under official World Rules, you can shoot in any direction.',
      'You cannot place the white beyond the baulk line.',
    ],
  },
  {
    id: 'snookers',
    title: 'Snookers',
    items: [
      'Deliberately snookering your opponent is allowed.',
      "A normal snooker does not allow you to hit an opponent's ball first.",
      'If an opponent fouls and leaves you snookered, special foul snooker rules apply.',
      "A foul snooker may allow you to nominate an opponent's ball or the black as your first ball to contact.",
      'When escaping a confirmed total snooker, the normal cushion/pot requirement is relaxed.',
    ],
  },
  {
    id: 'winning',
    title: 'Winning and losing',
    introduction:
      'You win by legally potting all seven of your colours, followed by the black on a separate shot.',
    listLabel: 'You lose immediately if:',
    items: [
      'You pot the black while any of your colours remain.',
      'You pot your final colour and the black in the same shot.',
      'You pot the black and white in the same shot.',
      'You commit any other foul while potting the black.',
      'You deliberately interfere with balls or commit another loss-of-frame offence.',
    ],
  },
  {
    id: 'general',
    title: 'General rules',
    items: [
      'At least one foot must remain on the floor during a shot.',
      'Wait for all balls to stop moving before taking your next shot.',
      'Do not touch balls with your hands, clothing or cue except where permitted.',
      'Accidental fouls still count.',
      'Unsporting behaviour is not permitted.',
    ],
  },
];

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
          <img src="/brand/virtuoso-white.png" alt="Virtuoso" />
          <span>POOL LEAGUE</span>
        </Link>
        <Link className="button secondary" to={fromDisplay ? '/display' : '/'}>
          {fromDisplay ? <Monitor size={18} /> : <ArrowLeft size={18} />}
          {fromDisplay ? 'Back to TV display' : 'Back to league'}
        </Link>
      </header>
      <main id="rules-content" className="rules-content">
        <PageHeading
          eyebrow="KNOW YOUR NEXT SHOT"
          title="Virtuoso Pool League — Rules"
          description="Based on the official World Eightball Pool Federation (WEPF) rules."
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
              <p>World Eightball Pool Rules · WEPF / English Pool Association</p>
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
