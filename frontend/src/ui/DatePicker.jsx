import { useEffect, useRef, useState } from 'react';
// the calendar's fonts are bundled with the app (free, open-source licence) so they work offline too
import '@fontsource/oswald/500.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import '@fontsource/caveat/600.css';
import { MONTHS, WEEKDAYS, fromIso, isFuture, longDate, pageCount, pageDays, pageOfDay, toIso } from './dateLogic.js';

const FLIP_MS = 480;

/**
 * Birth date picker that looks like a tear-off calendar page (the user's ChooseDate.jpeg, round 32):
 * "MONTH / YEAR" in the top-right corner – click the month or the year to choose it – and big dates with
 * their day of the week below it, 7 per page. Turn the pages (‹ ›, the arrow keys or the mouse wheel)
 * and click a date to choose it; the chosen date turns red with a handwritten "my birthday!" note.
 * value / onChange use 'YYYY-MM-DD'.
 */
export function DatePicker({ value, onChange, label = 'Date of birth', startYear }) {
  const today = new Date();
  const thisYear = today.getFullYear();
  const chosen = fromIso(value);
  const [year, setYear] = useState(chosen?.year ?? startYear ?? thisYear - 16);
  const [month, setMonth] = useState(chosen?.month ?? 0);
  const [page, setPage] = useState(chosen ? pageOfDay(chosen.day) : 0);
  const [picking, setPicking] = useState(null); // null | 'month' | 'year'
  const [flip, setFlip] = useState(null); // { from: { year, month, page }, dir: 1 | -1 } while a page turns
  const flipTimer = useRef(0);
  const yearList = useRef();
  useEffect(() => () => clearTimeout(flipTimer.current), []);
  // the year list opens scrolled to the year that is shown
  useEffect(() => { if (picking === 'year') yearList.current?.querySelector('.on')?.scrollIntoView({ block: 'center' }); }, [picking]);

  const pages = pageCount(year, month);
  const goTo = (y, m, p, dir) => {
    setFlip({ from: { year, month, page }, dir });
    clearTimeout(flipTimer.current);
    flipTimer.current = setTimeout(() => setFlip(null), FLIP_MS);
    setYear(y); setMonth(m); setPage(p);
  };
  // turning past the last page goes on to the next month (and back), like a real tear-off calendar
  const next = () => {
    if (page + 1 < pages) goTo(year, month, page + 1, 1);
    else if (!(year === thisYear && month >= today.getMonth())) goTo(month === 11 ? year + 1 : year, (month + 1) % 12, 0, 1);
  };
  const prev = () => {
    if (page > 0) goTo(year, month, page - 1, -1);
    else if (year > 1900 || month > 0) {
      const y = month === 0 ? year - 1 : year, m = (month + 11) % 12;
      goTo(y, m, pageCount(y, m) - 1, -1);
    }
  };
  const atEnd = page + 1 >= pages && year === thisYear && month >= today.getMonth();
  const atStart = page === 0 && year === 1900 && month === 0;

  const choose = (day) => { if (!isFuture(year, month, day, today)) onChange(toIso(year, month, day)); };
  const pickMonth = (m) => { setPicking(null); if (m !== month) goTo(year, m, 0, m > month ? 1 : -1); };
  const pickYear = (y) => {
    setPicking(null);
    const m = y === thisYear ? Math.min(month, today.getMonth()) : month;
    if (y !== year || m !== month) goTo(y, m, 0, y > year ? 1 : -1);
  };

  const keys = (e) => {
    if (picking) { if (e.key === 'Escape') { setPicking(null); e.stopPropagation(); } return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); e.stopPropagation(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); e.stopPropagation(); prev(); }
  };
  const wheel = (e) => { if (!picking && !flip && Math.abs(e.deltaY) > 20) (e.deltaY > 0 ? next : prev)(); };

  const renderPage = (y, m, p, cls = '', inert = false) => {
    const days = pageDays(y, m, p);
    const rows = [...days, ...Array(7 - days.length).fill(null)]; // the last page keeps its empty lines
    return (
      <div className={'tc-page ' + cls} aria-hidden={inert || undefined}>
        {rows.map((d, i) => {
          if (!d) return <div key={'e' + i} className="tc-row empty" />;
          const on = chosen && chosen.year === y && chosen.month === m && chosen.day === d.day;
          const future = isFuture(y, m, d.day, today);
          return (
            <button key={d.day} type="button" className={'tc-row' + (on ? ' on' : '')} disabled={future || inert}
              onClick={() => choose(d.day)} aria-pressed={!!on} aria-label={longDate(y, m, d.day)} tabIndex={inert ? -1 : 0}>
              <span className="tc-note">{on ? 'my birthday! 🎂' : ''}</span>
              <span className="tc-num">{d.day}</span>
              <span className="tc-wd">{WEEKDAYS[d.weekday]}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="tearcal" onKeyDown={keys} onWheel={wheel}>
      <div className="tc-head">
        <span className="tc-label">{label}</span>
        <span className="tc-title">
          <button type="button" className={'tc-pick' + (picking === 'month' ? ' open' : '')} onClick={() => setPicking(picking === 'month' ? null : 'month')} title="Choose the month">{MONTHS[month]}</button>
          <span className="tc-slash">/</span>
          <button type="button" className={'tc-pick' + (picking === 'year' ? ' open' : '')} onClick={() => setPicking(picking === 'year' ? null : 'year')} title="Choose the year">{year}</button>
        </span>
      </div>

      <div className="tc-sheet">
        {/* during a turn: the old page flips up and away (next) or the new page flips down into place (previous) */}
        {flip && flip.dir < 0 && renderPage(flip.from.year, flip.from.month, flip.from.page, '', true)}
        {renderPage(year, month, page, flip && flip.dir < 0 ? 'tc-in' : '')}
        {flip && flip.dir > 0 && renderPage(flip.from.year, flip.from.month, flip.from.page, 'tc-out', true)}

        {picking === 'month' && (
          <div className="tc-choose months" role="listbox" aria-label="Month">
            {MONTHS.map((m, i) => (
              <button key={m} type="button" className={i === month ? 'on' : ''} disabled={year === thisYear && i > today.getMonth()} onClick={() => pickMonth(i)}>{m.slice(0, 3)}</button>
            ))}
          </div>
        )}
        {picking === 'year' && (
          <div className="tc-choose years" role="listbox" aria-label="Year" ref={yearList}>
            {Array.from({ length: thisYear - 1900 + 1 }, (_, i) => thisYear - i).map((y) => (
              <button key={y} type="button" className={y === year ? 'on' : ''} onClick={() => pickYear(y)}>{y}</button>
            ))}
          </div>
        )}
      </div>

      <div className="tc-foot">
        <button type="button" className="tc-turn" onClick={prev} disabled={atStart || !!picking}>‹ Previous page</button>
        <span className="tc-pageno">Page {page + 1} / {pages}</span>
        <button type="button" className="tc-turn" onClick={next} disabled={atEnd || !!picking}>Next page ›</button>
      </div>
      <p className="tc-chosen" aria-live="polite">{chosen ? <>Born on <b>{longDate(chosen.year, chosen.month, chosen.day)}</b></> : 'Choose the year and the month at the top, then turn the pages and click your birthday.'}</p>
    </div>
  );
}
