import { formatLongDate, formatUrgeDuration, moodOption, type DayDetail } from '@journal/shared';
import { Mood, Outcome, time12 } from './ui';

/**
 * One day of the journal laid out like a diary page: the written answers first, in a
 * calm reading style, then that day's habits and urges.
 */
export function DiaryPage({ day }: { day: DayDetail }) {
  const mood = moodOption(day.mood);
  const written = day.answers.filter((a) => a.type === 'text' && a.textValue?.trim());
  const done = day.habits.filter((h) => h.completed).length;
  return (
    <article className="diary-page" aria-label={`Journal for ${formatLongDate(day.date)}`}>
      <header className="diary-head">
        <div>
          <div className="diary-weekday">{day.weekday}</div>
          <h2 className="diary-date">{formatLongDate(day.date).replace(/^\w+, /, '')}</h2>
        </div>
        <div className="diary-chips">
          {mood && (
            <span className="diary-chip" title={mood.label}>
              <span aria-hidden="true">{mood.emoji}</span> {mood.label}
            </span>
          )}
          {day.habits.length > 0 && (
            <span className={`diary-chip${done === day.habits.length ? ' good' : ''}`}>
              ✓ Habits {done}/{day.habits.length}
            </span>
          )}
          {day.urges.length > 0 && <span className="diary-chip">〰 {day.urges.length} urge{day.urges.length === 1 ? '' : 's'}</span>}
        </div>
      </header>

      {written.length === 0 ? (
        <p className="diary-empty">Nothing was written on this day.</p>
      ) : (
        written.map((a) => (
          <section key={a.questionId} className="diary-entry">
            <h3>{a.question}</h3>
            <p>{a.textValue}</p>
          </section>
        ))
      )}

      {day.answers
        .filter((a) => a.type === 'emoji' && a.emojiValue !== null && a.systemKey !== 'mood')
        .map((a) => (
          <section key={a.questionId} className="diary-entry">
            <h3>{a.question}</h3>
            <p>
              <Mood value={a.emojiValue} withLabel />
            </p>
          </section>
        ))}

      {(day.habits.length > 0 || day.urges.length > 0) && (
        <footer className="diary-foot">
          {day.habits.length > 0 && (
            <div>
              <h4>Habits</h4>
              <ul>
                {day.habits.map((h) => (
                  <li key={h.habitId} className={h.completed ? 'done' : ''}>
                    <span aria-hidden="true">{h.completed ? '✓' : '○'}</span> {h.name}
                    {h.type !== 'boolean' && (
                      <span className="muted">
                        {' '}
                        · {h.value}/{h.target} {h.unit ?? ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {day.urges.length > 0 && (
            <div>
              <h4>Urges</h4>
              <ul>
                {day.urges.map((u) => (
                  <li key={u.id}>
                    {time12(u.localTime)} · intensity {u.intensity}
                    {u.durationMinutes !== null && ` · ${formatUrgeDuration(u.durationMinutes)}`} · <Outcome diverted={u.diverted} />
                    {u.triggerText && <div className="small muted">Trigger: {u.triggerText}</div>}
                    {u.actionTaken && <div className="small muted">What I did: {u.actionTaken}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
