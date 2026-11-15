import { useEffect, useState, type CSSProperties } from 'react';
import type { ResultResponse } from '../../shared/api';
import { formatTime, histogramTotal, secondsTaken, shareLine } from '../../shared/score';
import { LEVEL_LABEL, MAX_CHARGES, type DayState, type Level } from '../../shared/types';
import { api, messageOf } from '../api';
import { Bolt, Flame } from '../board/icons';
import { useLoad } from '../hooks/useLoad';
import { openUrl, promptLogin, toast } from '../platform';

type Props = {
  day: number;
  level: Level;
  title: string;
  date: string;
  /** Final state as the client knows it (the only copy for logged-out players). */
  state: DayState;
  loggedIn: boolean;
  username: string | null;
  isToday: boolean;
  subreddit: string | null;
  /** Client clock time of the next board. */
  nextAt: number;
  /** Another of the day's boards that is still open, if any. */
  nextLevel: Level | null;
  onNextLevel: (level: Level) => void;
  onLevels: () => void;
  onBoard: () => void;
  onArchive: () => void;
  onLeaders: () => void;
};

const BUCKETS = ['1', '2', '3', '4', '5', 'fuse'] as const;

const useCountdown = (until: number): string => {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, until - Date.now()));
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [until]);
  if (left === null) return '--:--:--';
  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

export const Result = ({
  day,
  level,
  title,
  date,
  state,
  loggedIn,
  username,
  isToday,
  subreddit,
  nextAt,
  nextLevel,
  onNextLevel,
  onLevels,
  onBoard,
  onArchive,
  onLeaders,
}: Props) => {
  const loaded = useLoad(`result:${day}:${level}`, () => api.result(day, level));
  const data: ResultResponse | null = loaded.data;
  const setData = loaded.patch;
  const [failure, setProblem] = useState<string | null>(null);
  const problem = failure ?? loaded.error;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [threadUrl, setThreadUrl] = useState<string | null>(null);
  const countdown = useCountdown(nextAt);

  const solved = state.status === 'solved';
  const used = state.attempts.length;
  const bucket = solved ? used - 1 : 5;
  const histogram = data?.histogram ?? null;
  const total = histogram ? histogramTotal(histogram) : 0;
  const peak = histogram ? Math.max(1, ...histogram) : 1;
  const line = data && loggedIn ? data.shareLine : shareLine(day, level, state);
  const shared = data?.shared === true;
  const joined = data?.joined === true;
  const canShare = data?.canShare === true && !shared;

  const share = async () => {
    setBusy(true);
    try {
      const done = await api.share(day, level);
      setThreadUrl(done.url);
      setData((d) => ({ ...d, shared: true }));
      setConfirming(false);
      toast('Posted to the results thread.');
    } catch (e) {
      setProblem(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      await api.join();
      setData((d) => ({ ...d, joined: true }));
      toast(subreddit ? `Joined r/${subreddit}.` : 'Joined.');
    } catch (e) {
      setProblem(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const standing = (): string => {
    if (!histogram) return problem ? 'Could not load how others did.' : 'Counting results…';
    if (total <= 1) return solved ? 'First to clear this board.' : 'First to finish this board.';
    if (data?.rank && isToday) return `Place ${data.rank} of ${data.ranked} on ${LEVEL_LABEL[level]} today.`;
    if (solved && data) return `Used fewer charges than ${data.beat}% of ${total} players.`;
    return `${total} players have finished this board.`;
  };

  // One primary action, picked by what is still worth doing.
  let primary: { label: string; run: () => void };
  if (nextLevel) {
    primary = { label: `Play ${LEVEL_LABEL[nextLevel]}`, run: () => onNextLevel(nextLevel) };
  } else if (!loggedIn) primary = { label: 'Log in to keep a streak', run: promptLogin };
  else if (canShare) primary = { label: 'Share result', run: () => setConfirming(true) };
  else if (!joined && subreddit) primary = { label: `Join r/${subreddit}`, run: () => void join() };
  else primary = { label: 'Past boards', run: onArchive };
  const offerShare = canShare && primary.label !== 'Share result' && !confirming;

  return (
    <main className="result">
      <article className={`slip ${solved ? 'is-pass' : 'is-fail'}`} aria-label="Test report">
        <header className="slip-head">
          <div>
            <p className="slip-kicker">Report · {date}</p>
            <h1 className="display slip-title">{title}</h1>
          </div>
          <p className="display stamp" aria-label={solved ? 'Passed' : 'Fuse blown'}>
            {solved ? 'Pass' : 'Fuse'}
          </p>
        </header>

        <dl className="slip-rows">
          <div>
            <dt>Charges</dt>
            <dd>
              <span className="slip-bolts" aria-hidden="true">
                {Array.from({ length: MAX_CHARGES }, (_, i) => (
                  <Bolt key={i} className={i < used ? 'is-used' : ''} />
                ))}
              </span>
              {used} of {MAX_CHARGES}
            </dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{formatTime(secondsTaken(state))}</dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd>
              {loggedIn ? (
                <>
                  <Flame className={data && data.streak.current > 0 ? 'is-lit' : ''} />
                  {data ? data.streak.current : '–'}
                  {data?.streak.tier && <span className="slip-tier">{data.streak.tier}</span>}
                  {data && data.streak.best > data.streak.current && (
                    <span className="slip-note">best {data.streak.best}</span>
                  )}
                </>
              ) : (
                <span className="slip-note">not saved while logged out</span>
              )}
            </dd>
          </div>
        </dl>

        <section className="histo" aria-label="How everyone did">
          <div className="histo-bars">
            {BUCKETS.map((label, i) => {
              const count = histogram?.[i] ?? 0;
              const mine = i === bucket;
              return (
                <div key={label} className={`histo-col ${mine ? 'is-mine' : ''}`}>
                  <span className="histo-count">{histogram ? count : ''}</span>
                  <span
                    className="histo-bar"
                    style={{ '--fill': histogram ? count / peak : 0 } as CSSProperties}
                  />
                  <span className="histo-label">{label}</span>
                  {mine && <span className="histo-you">you</span>}
                </div>
              );
            })}
          </div>
          <p className="histo-note">{standing()}</p>
        </section>

        {confirming ? (
          <section className="confirm" aria-label="Confirm comment">
            <p className="slip-note">
              This posts a public comment from your account{username ? ` (u/${username})` : ''}, as a
              reply in this board&rsquo;s results thread:
            </p>
            <blockquote className="confirm-line">{line}</blockquote>
            <div className="confirm-actions">
              <button type="button" className="slip-btn" disabled={busy} onClick={() => void share()}>
                {busy ? 'Posting…' : 'Post as me'}
              </button>
              <button type="button" className="slip-link" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </section>
        ) : (
          <section className="slip-actions">
            <button type="button" className="slip-btn" disabled={busy} onClick={primary.run}>
              {primary.label}
            </button>
            {shared && (
              <p className="slip-note">
                Shared to the thread.{' '}
                {threadUrl && (
                  <button type="button" className="slip-inline" onClick={() => openUrl(threadUrl)}>
                    View it
                  </button>
                )}
              </p>
            )}
            {problem && histogram && <p className="slip-note is-error">{problem}</p>}
          </section>
        )}
      </article>

      <nav className="result-nav" aria-label="More">
        {offerShare && (
          <button type="button" className="link" onClick={() => setConfirming(true)}>
            Share result
          </button>
        )}
        <button type="button" className="link" onClick={onLevels}>
          All boards
        </button>
        <button type="button" className="link" onClick={onBoard}>
          This board
        </button>
        <button type="button" className="link" onClick={onLeaders}>
          Leaders
        </button>
        {loggedIn && !joined && subreddit && !primary.label.startsWith('Join') && (
          <button type="button" className="link" disabled={busy} onClick={() => void join()}>
            Join r/{subreddit}
          </button>
        )}
      </nav>
      <p className="result-next silk">Next board in {countdown}</p>
    </main>
  );
};
