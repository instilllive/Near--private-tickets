import { useEffect, useState } from "react";
import {
  CONTRACT_ID,
  connectAccount,
  explorerAccount,
  explorerTx,
  isOwner,
  mintTicket,
  ticketRecord,
  tokensForOwner,
  transferTicket,
} from "./near.js";

const EVENTS_KEY = "ptix-near:events:v1";
const SESSION_KEY = "ptix-near:session:v1";

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function App() {
  const [tab, setTab] = useState("event");
  const [accountId, setAccountId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (saved?.accountId) {
        setAccountId(saved.accountId);
        setPrivateKey(saved.privateKey || "");
        setSession({ accountId: saved.accountId });
      }
    } catch {
      /* ignore */
    }
  }, []);

  function remember(id, key) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accountId: id, privateKey: key }));
    setSession({ accountId: id });
  }

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setPrivateKey("");
  }

  async function withAccount(fn) {
    setError("");
    setStatus("Signing on testnet…");
    try {
      const account = await connectAccount(accountId.trim(), privateKey.trim());
      remember(accountId.trim(), privateKey.trim());
      const result = await fn(account);
      setStatus("");
      return result;
    } catch (e) {
      setStatus("");
      setError(e.message || String(e));
      throw e;
    }
  }

  return (
    <div className="wrap">
      <header>
        <h1>Private Tickets on NEAR testnet</h1>
        <p>
          NFT tickets are for ownership, trading and provenance. Events and the
          door log stay in this app. Contract:{" "}
          <a href={explorerAccount(CONTRACT_ID)}>{CONTRACT_ID}</a>
        </p>
      </header>

      <div className="card">
        <h2>Testnet account</h2>
        <p className="muted">
          Paste a testnet account and its private key. It stays in this browser
          tab only, is never sent to our servers, and is used only to sign
          testnet transactions. Do not use a mainnet key.
        </p>
        <label>Account ID</label>
        <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="you.testnet" />
        <label>Private key (testnet only)</label>
        <input
          type="password"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          placeholder="ed25519:…"
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={() => remember(accountId.trim(), privateKey.trim())}>
            Use this account
          </button>
          <button className="ghost" onClick={signOut}>Clear</button>
        </div>
        {session && <p className="session ok">Using {session.accountId}</p>}
      </div>

      <div className="tabs">
        {[["event", "Event"], ["ticket", "Ticket"], ["door", "Door"]].map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "event" && <EventPanel withAccount={withAccount} accountId={accountId} />}
      {tab === "ticket" && <TicketPanel withAccount={withAccount} accountId={accountId} />}
      {tab === "door" && <DoorPanel accountId={accountId} />}

      {status && <p className="muted">{status}</p>}
      {error && <p className="err">{error}</p>}
    </div>
  );
}

function EventPanel({ withAccount, accountId }) {
  const [events, setEvents] = useState(loadEvents);
  const [name, setName] = useState("Demo Night");
  const [date, setDate] = useState("2026-11-14");
  const [eventId, setEventId] = useState(events[0]?.id || "");
  const [guest, setGuest] = useState("");
  const [result, setResult] = useState(null);

  function addEvent(e) {
    e.preventDefault();
    const id = `evt-${Date.now()}`;
    const next = [{ id, name, date }, ...events];
    localStorage.setItem("ptix-near:events:v1", JSON.stringify(next));
    setEvents(next);
    setEventId(id);
  }

  async function mint(e) {
    e.preventDefault();
    const ev = events.find((x) => x.id === eventId) || { id: eventId, name };
    const out = await withAccount((account) =>
      mintTicket(account, {
        receiverId: guest.trim(),
        eventId: ev.id,
        eventName: ev.name,
      })
    );
    setResult(out);
  }

  return (
    <>
      <div className="card">
        <h2>1. Create an event (stored in this browser)</h2>
        <form onSubmit={addEvent}>
          <div className="row">
            <div>
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <button className="primary" style={{ marginTop: 12 }} type="submit">Save event</button>
        </form>
        {events.length > 0 && (
          <ul className="history">
            {events.map((ev) => (
              <li key={ev.id} className="mono">
                {ev.name} — {ev.date} — {ev.id}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h2>2. Mint a ticket (on-chain NEP-171)</h2>
        <form onSubmit={mint}>
          <label>Event</label>
          <input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="evt-…" required />
          <label>Guest NEAR account</label>
          <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="guest.testnet" required />
          <button className="primary" style={{ marginTop: 12 }} type="submit">Mint to guest</button>
        </form>
        {result && (
          <p className="ok">
            Minted {result.token || "(see transaction)"}.{" "}
            {result.hash && <a href={explorerTx(result.hash)}>View transaction</a>}
          </p>
        )}
      </div>
    </>
  );
}

function TicketPanel({ withAccount, accountId }) {
  const [tokenId, setTokenId] = useState("");
  const [record, setRecord] = useState(null);
  const [owned, setOwned] = useState([]);
  const [receiver, setReceiver] = useState("");
  const [tx, setTx] = useState(null);
  const [err, setErr] = useState("");

  async function lookup(e) {
    e?.preventDefault?.();
    setErr("");
    try {
      setRecord(await ticketRecord(tokenId.trim()));
    } catch (e2) {
      setErr(e2.message || String(e2));
    }
  }

  async function loadOwned() {
    setErr("");
    try {
      setOwned(await tokensForOwner(accountId.trim()));
    } catch (e2) {
      setErr(e2.message || String(e2));
    }
  }

  async function send(e) {
    e.preventDefault();
    const out = await withAccount((account) =>
      transferTicket(account, { receiverId: receiver.trim(), tokenId: tokenId.trim() })
    );
    setTx(out);
    setRecord(await ticketRecord(tokenId.trim()));
  }

  return (
    <>
      <div className="card">
        <h2>Look up a ticket</h2>
        <form onSubmit={lookup}>
          <label>Token ID</label>
          <input value={tokenId} onChange={(e) => setTokenId(e.target.value)} placeholder="ticket-1" />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" type="submit">Show ownership</button>
            <button type="button" onClick={loadOwned}>Tickets I own</button>
          </div>
        </form>
        {owned.length > 0 && (
          <ul className="history">
            {owned.map((t) => (
              <li key={t.token_id}>
                <button className="ghost" onClick={() => { setTokenId(t.token_id); setRecord(null); }}>
                  {t.token_id}
                </button>{" "}
                owner {t.owner_id}
              </li>
            ))}
          </ul>
        )}
        {record ? (
          <div>
            <p>
              <b>{record.event_name}</b> ({record.event_id})<br />
              Owner: <span className="mono">{record.token.owner_id}</span>
            </p>
            <h3>Provenance</h3>
            <ul className="history">
              {record.history.map((h, i) => (
                <li key={i} className="mono">
                  {h.from || "mint"} → {h.to}
                </li>
              ))}
            </ul>
          </div>
        ) : record === null ? null : (
          <p className="warn">No ticket with that id.</p>
        )}
        {err && <p className="err">{err}</p>}
      </div>
      <div className="card">
        <h2>Transfer</h2>
        <p className="muted">Sign with the current owner’s testnet key.</p>
        <form onSubmit={send}>
          <label>Receiver</label>
          <input value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="buyer.testnet" required />
          <button className="primary" style={{ marginTop: 12 }} type="submit">Transfer ticket</button>
        </form>
        {tx?.hash && (
          <p className="ok">
            Transferred. <a href={explorerTx(tx.hash)}>View transaction</a>
          </p>
        )}
      </div>
    </>
  );
}

function DoorPanel({ accountId }) {
  const [tokenId, setTokenId] = useState("");
  const [claimed, setClaimed] = useState(accountId || "");
  const [record, setRecord] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [log, setLog] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ptix-near:door:v1") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => setClaimed(accountId || ""), [accountId]);

  async function check(e) {
    e.preventDefault();
    const rec = await ticketRecord(tokenId.trim());
    setRecord(rec);
    if (!rec) {
      setVerdict({ ok: false, reason: "Ticket not found on chain." });
      return;
    }
    const ok = await isOwner(tokenId.trim(), claimed.trim());
    const result = ok
      ? { ok: true, reason: `${claimed} is the on-chain owner.` }
      : {
          ok: false,
          reason: `${claimed} is not the owner. Current owner is ${rec.token.owner_id}.`,
        };
    setVerdict(result);
    if (ok) {
      const entry = {
        at: new Date().toISOString(),
        tokenId: tokenId.trim(),
        account: claimed.trim(),
        event: rec.event_name,
      };
      const next = [entry, ...log];
      localStorage.setItem("ptix-near:door:v1", JSON.stringify(next));
      setLog(next);
    }
  }

  return (
    <div className="card">
      <h2>Door check-in</h2>
      <p className="muted">
        The door asks the contract who owns the ticket. Admission is granted only
        when the presented account is the current on-chain owner. The check-in
        log stays in this app, not on chain.
      </p>
      <form onSubmit={check}>
        <label>Token ID</label>
        <input value={tokenId} onChange={(e) => setTokenId(e.target.value)} placeholder="ticket-1" required />
        <label>Presented account</label>
        <input value={claimed} onChange={(e) => setClaimed(e.target.value)} placeholder="guest.testnet" required />
        <button className="primary" style={{ marginTop: 12 }} type="submit">
          Verify on-chain owner
        </button>
      </form>
      {verdict && <p className={verdict.ok ? "ok" : "err"}>{verdict.ok ? "Admit. " : "Deny. "}{verdict.reason}</p>}
      {record && (
        <p className="mono">
          {record.event_name} — owner {record.token.owner_id}
        </p>
      )}
      {log.length > 0 && (
        <>
          <h3>Door log (this browser)</h3>
          <ul className="history">
            {log.map((e, i) => (
              <li key={i} className="mono">
                {e.at} — {e.tokenId} — {e.account}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
