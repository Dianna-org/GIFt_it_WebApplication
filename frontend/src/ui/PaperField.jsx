import { useEffect, useId, useRef, useState } from 'react';
// fonts: handwriting on the paper (Caveat) and the rubber stamp (Special Elite) – free, bundled, work offline
import '@fontsource/caveat/600.css';
import '@fontsource/special-elite/400.css';
import { stampText } from './stampText.js';

const STAMP_MS = 900;


/**
 * A form field that looks like a long strip of paper (round 33, log in + create account).
 * The user writes on it; when they leave it (Enter, Tab or clicking elsewhere) a rubber stamp comes down and
 * stamps the strip with exactly what they wrote. Clicking the stamped strip lets them write it again.
 * Passwords have 👁 Show / Hide: shown, the stamp prints the password; hidden, it prints the dots.
 * The real <input> stays in the form (validation, password managers, autofill); it is only hidden while
 * the stamp is shown.
 */
export function PaperField({ label, value, onChange, type = 'text', hint, tilt = 0, inputProps = {} }) {
  const id = useId();
  const input = useRef();
  const password = type === 'password';
  const [show, setShow] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [printed, setPrinted] = useState(''); // what is on the paper now
  const [stamping, setStamping] = useState(0); // changes on every stamp -> replays the animation
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const stamp = (v = value, visible = show) => {
    if (!v) { setStamped(false); return; }
    setPrinted(stampText(v, { password, show: visible }));
    setStamped(true);
    setStamping((n) => n + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStamping(0), STAMP_MS);
  };
  // filled in by the browser / a password manager while the field isn't being used: stamp it too
  useEffect(() => {
    if (value && !stamped && document.activeElement !== input.current) stamp();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = () => { setStamped(false); requestAnimationFrame(() => input.current?.focus()); };
  const keys = (e) => {
    if (e.key !== 'Enter') return;
    // Enter finishes this strip (stamp) and moves on to the next one instead of sending the form
    e.preventDefault();
    const fields = [...e.currentTarget.form.querySelectorAll('.strip-input')];
    const next = fields[fields.indexOf(e.currentTarget) + 1];
    if (next) next.focus(); else e.currentTarget.blur();
  };
  const toggleShow = () => {
    const visible = !show;
    setShow(visible);
    if (stamped) stamp(value, visible); // stamp it again: the password itself, or the dots
  };

  return (
    <div className={'strip' + (stamped ? ' stamped' : '')} style={{ '--tilt': `${tilt}deg` }}>
      <label className="strip-label" htmlFor={id}>{label}</label>
      <div className="strip-paper">
        <input ref={input} id={id} className="strip-input" type={password && !show ? 'password' : password ? 'text' : type}
          value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => stamp()} onFocus={() => setStamped(false)}
          onKeyDown={keys} aria-describedby={hint ? id + '-hint' : undefined} tabIndex={0} {...inputProps} />
        {stamped && (
          <button type="button" className="strip-mark" onClick={edit} title="Click to write it again" aria-label={`${label}: ${password && !show ? 'hidden password' : printed}. Click to change it.`}>
            <span key={stamping} className={'ink' + (stamping ? ' new' : '')} style={{ fontSize: printed.length > 30 ? 15 : printed.length > 20 ? 18 : 22 }}>{printed}</span>
          </button>
        )}
        {stamping > 0 && <span key={'s' + stamping} className="stamper" aria-hidden="true"><span className="stamper-handle" /><span className="stamper-base" /></span>}
        {password && (
          <button type="button" className="strip-eye" onClick={toggleShow} aria-pressed={show} title={show ? 'Hide the password (the stamp shows dots)' : 'Show the password (the stamp shows it)'}>
            {show ? '🙈 Hide' : '👁 Show'}
          </button>
        )}
      </div>
      {hint && <small id={id + '-hint'} className="strip-hint">{hint}</small>}
    </div>
  );
}
