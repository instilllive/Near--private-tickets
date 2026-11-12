import { useEffect, useState } from "react";
import {
  CONTRACT_ID,
  explorerAccount,
  explorerTx,
  isOwner,
  mintTicket,
  ticketRecord,
  tokensForOwner,
  transferTicket,
} from "./near.js";
import { initSelector, onAccountsChanged, openWalletModal, signedAccountId, walletSignOut } from "./wallet.js";

const EVENTS_KEY = "ptix-near:events:v1";
const LEGACY_SESSION = "ptix-near:session:v1";
const LEGACY_DEMO = "ptix-near:demo-accounts:v1";

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function clearLegacyKeys() {
  try {
    sessionStorage.removeItem(LEGACY_SESSION);
    sessionStorage.removeItem(LEGACY_DEMO);
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [tab, setTab] = useState("event");
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    clearLegacyKeys();
    initSelector().finally(() => setReady(true));
    const off = onAccountsChanged((accounts) => {
      setAccountId(signedAccountId(accounts));
    });
    return off;
  }, []);

  async function connect() {
    setError("");
    try {
      await openWalletModal();
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  async function disconnect() {
    setError("");
    try {
      await walletSignOut();
      setAccountId("");
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  async function withWallet(fn) {
    if (!accountId) {
      const msg = "Connect a NEAR testnet wallet to mint or transfer.";
      setError(msg);
      throw new Error(msg);
    }
    setError("");
    setStatus("Approve the transaction in your wallet…");
    try {
      const result = await fn();
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
        <p className="eyebrow">Independent hackathon entry · testnet only</p>
        <h1>Private Tickets</h1>
        <p>
          NFT tickets are for ownership, trading and provenance. Events and the
          door log stay in this app. Contract:{" "}
          <a href={explorerAccount(CONTRACT_ID)}>{CONTRACT_ID}</a>
        </p>
      </header>

      <div className="card" data-testid="session-bar">
        {accountId ? (
          <div className="connected">
            <p className="ok">
              Connected: <span className="mono" data-testid="session-account">{accountId}</span>
            </p>
            <button className="ghost" onClick={disconnect}>Sign out</button>
          </div>
        ) : (
          <>
            <h2>NEAR testnet wallet</h2>
            <p className="muted">
              You can look up a ticket, see its owner and provenance, and run a
              door check without a wallet. Connect a testnet wallet (MyNearWallet
              or Meteor) only when you want to mint or transfer.
            </p>
            <button className="primary" onClick={connect} disabled={!ready} data-testid="connect-wallet">
              Connect testnet wallet
            </button>
          </>
        )}
      </div>

      <div className="tabs">
        {[["event", "Event"], ["ticket", "Ticket"], ["door", "Door"]].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "event" && (
        <EventPanel withWallet={withWallet} connected={!!accountId} onMinted={(id) => setTokenId(id)} />
      )}
      {tab === "ticket" && (
        <TicketPanel
          withWallet={withWallet}
          accountId={accountId}
          tokenId={tokenId}
          setTokenId={setTokenId}
        />
      )}
      {tab === "door" && (
        <DoorPanel accountId={accountId} tokenId={tokenId} setTokenId={setTokenId} />
      )}

      {status && <p className="muted" data-testid="status">{status}</p>}
      {error && <p className="err" data-testid="error">{error}</p>}

      <footer className="site-footer">
        <p className="built">Built on NEAR</p>
        <p className="muted">
          An independent entry, not an official NEAR Protocol site. Tickets live
          on NEAR testnet only — no mainnet funds.
        </p>
      </footer>
    </div>
  );
}

function EventPanel({ withWallet, connected, onMinted }) {
  const [events, setEvents] = useState(loadEvents);
  const [name, setName] = useState("NEAR Demo Night");
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
    const out = await withWallet(() =>
      mintTicket({
        receiverId: guest.trim(),
        eventId: ev.id,
        eventName: ev.name,
      })
    );
    setResult(out);
    if (out?.token) onMinted(out.token);
  }

  return (
    <>
      <div className="card">
        <h2>1. Create an event (stored in this browser)</h2>
        <form onSubmit={addEvent}>
          <div className="row">
            <div>
              <label>Name</label>
              <input data-testid="event-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label>Date</label>
              <input data-testid="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <button className="primary" style={{ marginTop: 12 }} type="submit" data-testid="save-event">
            Save event
          </button>
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
        {!connected && <p className="muted">Connect a testnet wallet to mint.</p>}
        <form onSubmit={mint}>
          <label>Event</label>
          <input data-testid="event-id" value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="evt-…" required />
          <label>Guest NEAR account</label>
          <input
            data-testid="guest-account"
            value={guest}
            onChange={(e) => setGuest(e.target.value)}
            placeholder="guest.testnet"
            required
          />
          <button className="primary" style={{ marginTop: 12 }} type="submit" data-testid="mint-btn" disabled={!connected}>
            Mint to guest
          </button>
        </form>
        {result && (
          <p className="ok" data-testid="mint-result">
            Minted {result.token || "(see transaction)"}.{" "}
            {result.hash && <a href={explorerTx(result.hash)}>View transaction</a>}
          </p>
        )}
      </div>
    </>
  );
}

function TicketPanel({ withWallet, accountId, tokenId, setTokenId }) {
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
    if (!accountId) {
      setErr("Connect a wallet to list tickets you own, or look up a token id below.");
      return;
    }
    try {
      setOwned(await tokensForOwner(accountId.trim()));
    } catch (e2) {
      setErr(e2.message || String(e2));
    }
  }

  async function send(e) {
    e.preventDefault();
    const out = await withWallet(() =>
      transferTicket({ receiverId: receiver.trim(), tokenId: tokenId.trim() })
    );
    setTx(out);
    setRecord(await ticketRecord(tokenId.trim()));
  }

  return (
    <>
      <div className="card">
        <h2>Look up a ticket</h2>
        <p className="muted">No wallet needed. This reads the contract on testnet.</p>
        <form onSubmit={lookup}>
          <label>Token ID</label>
          <input
            data-testid="token-id"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            placeholder="ticket-1"
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" type="submit" data-testid="show-owner">Show ownership</button>
            <button type="button" onClick={loadOwned} disabled={!accountId}>Tickets I own</button>
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
          <div data-testid="ticket-record">
            <p>
              <b>{record.event_name}</b> ({record.event_id})<br />
              Owner: <span className="mono" data-testid="current-owner">{record.token.owner_id}</span>
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
        ) : null}
        {err && <p className="err">{err}</p>}
      </div>
      <div className="card">
        <h2>Transfer</h2>
        <p className="muted">
          {accountId
            ? "Sign with the current owner’s testnet wallet."
            : "Connect the current owner’s testnet wallet to transfer."}
        </p>
        <form onSubmit={send}>
          <label>Receiver</label>
          <input
            data-testid="receiver"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder="buyer.testnet"
            required
          />
          <button className="primary" style={{ marginTop: 12 }} type="submit" data-testid="transfer-btn" disabled={!accountId}>
            Transfer ticket
          </button>
        </form>
        {tx?.hash && (
          <p className="ok" data-testid="transfer-result">
            Transferred. <a href={explorerTx(tx.hash)}>View transaction</a>
          </p>
        )}
      </div>
    </>
  );
}

function DoorPanel({ accountId, tokenId, setTokenId }) {
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

  useEffect(() => {
    if (accountId) setClaimed(accountId);
  }, [accountId]);

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
        No wallet needed. The door asks the contract who owns the ticket.
        Admission is granted only when the presented account is the current
        on-chain owner. The check-in log stays in this app, not on chain.
      </p>
      <form onSubmit={check}>
        <label>Token ID</label>
        <input
          data-testid="door-token"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          placeholder="ticket-1"
          required
        />
        <label>Presented account</label>
        <input
          data-testid="door-account"
          value={claimed}
          onChange={(e) => setClaimed(e.target.value)}
          placeholder="guest.testnet"
          required
        />
        <button className="primary" style={{ marginTop: 12 }} type="submit" data-testid="verify-btn">
          Verify on-chain owner
        </button>
      </form>
      {verdict && (
        <p className={`verdict ${verdict.ok ? "ok" : "err"}`} data-testid="verdict">
          {verdict.ok ? "Admit. " : "Deny. "}
          {verdict.reason}
        </p>
      )}
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
