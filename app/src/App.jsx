import { useEffect, useState } from "react";
import {
  CONTRACT_ID,
  buyResale,
  canEnter,
  cancelResale,
  checkIn,
  explorerAccount,
  explorerTx,
  formatNear,
  hasAttended,
  listResale,
  mintTicket,
  parseNear,
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

      <div className="card session-card" data-testid="session-bar">
        {accountId ? (
          <div className="connected">
            <p className="ok">
              Connected: <span className="mono" data-testid="session-account">{accountId}</span>
            </p>
            <button className="ghost" onClick={disconnect}>Sign out</button>
          </div>
        ) : (
          <div className="session-body">
            <div className="session-copy">
              <h2>NEAR testnet wallet</h2>
              <p className="muted">
                Look up a ticket, its owner and provenance, or run a door check
                without a wallet. Connect a testnet wallet (MyNearWallet or Meteor)
                only to mint or transfer.
              </p>
            </div>
            <button className="primary" onClick={connect} disabled={!ready} data-testid="connect-wallet">
              Connect testnet wallet
            </button>
          </div>
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
  const [cap, setCap] = useState("1");
  const [royalty, setRoyalty] = useState("5");
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
    const bps = Math.round(Number(royalty) * 100);
    if (!Number.isFinite(bps) || bps < 0 || bps > 10000) {
      throw new Error("Royalty must be between 0 and 100 percent.");
    }
    const maxResalePrice = parseNear(cap);
    if (!maxResalePrice) throw new Error("Enter a max resale price in NEAR.");
    const out = await withWallet(() =>
      mintTicket({
        receiverId: guest.trim(),
        eventId: ev.id,
        eventName: ev.name,
        maxResalePrice,
        royaltyBps: bps,
      })
    );
    setResult(out);
    if (out?.token) onMinted(out.token);
  }

  return (
    <div className="panel-grid">
      <div className="card">
        <h2>1. Create an event</h2>
        <p className="muted">Stored in this browser, not on chain.</p>
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
        <h2>2. Mint a ticket</h2>
        <p className="muted">
          {connected
            ? "Mints an on-chain NEP-171 ticket on NEAR testnet."
            : "Connect a testnet wallet to mint an on-chain NEP-171 ticket."}
        </p>
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
          <div className="row">
            <div>
              <label>Max resale (NEAR)</label>
              <input
                data-testid="resale-cap"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                inputMode="decimal"
                required
              />
            </div>
            <div>
              <label>Host royalty (%)</label>
              <input
                data-testid="royalty-bps"
                value={royalty}
                onChange={(e) => setRoyalty(e.target.value)}
                inputMode="decimal"
                required
              />
            </div>
          </div>
          <p className="muted">The contract rejects any later listing above this cap and pays the royalty to the event host.</p>
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
    </div>
  );
}

function TicketPanel({ withWallet, accountId, tokenId, setTokenId }) {
  const [record, setRecord] = useState(null);
  const [owned, setOwned] = useState([]);
  const [receiver, setReceiver] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [tx, setTx] = useState(null);
  const [err, setErr] = useState("");
  const [returning, setReturning] = useState(false);

  async function lookup(e) {
    e?.preventDefault?.();
    setErr("");
    try {
      const rec = await ticketRecord(tokenId.trim());
      setRecord(rec);
      if (rec?.event_id && rec?.token?.owner_id) {
        setReturning(Boolean(await hasAttended(rec.token.owner_id, rec.event_id)));
      } else {
        setReturning(false);
      }
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
    await refresh();
  }

  async function refresh() {
    const rec = await ticketRecord(tokenId.trim());
    setRecord(rec);
    if (rec?.event_id && rec?.token?.owner_id) {
      setReturning(Boolean(await hasAttended(rec.token.owner_id, rec.event_id)));
    }
    return rec;
  }

  async function list(e) {
    e.preventDefault();
    const priceYocto = parseNear(listPrice);
    if (!priceYocto) throw new Error("Enter a listing price in NEAR.");
    const out = await withWallet(() => listResale({ tokenId: tokenId.trim(), priceYocto }));
    setTx(out);
    await refresh();
  }

  async function cancel(e) {
    e.preventDefault();
    const out = await withWallet(() => cancelResale({ tokenId: tokenId.trim() }));
    setTx(out);
    await refresh();
  }

  async function buy(e) {
    e.preventDefault();
    const priceYocto = record?.listing?.price;
    if (!priceYocto) throw new Error("This ticket is not listed.");
    const out = await withWallet(() => buyResale({ tokenId: tokenId.trim(), priceYocto }));
    setTx(out);
    await refresh();
  }

  const isOwnerConnected = !!(accountId && record?.token?.owner_id === accountId);
  const attended = !!record?.attended_at;

  return (
    <div className="panel-grid">
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
          <div className="row actions" style={{ marginTop: 12 }}>
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
          <div className="record-block" data-testid="ticket-record">
            <p>
              <b>{record.event_name}</b>
              <span className="record-meta mono">{record.event_id}</span>
              Owner: <span className="mono" data-testid="current-owner">{record.token.owner_id}</span>
            </p>
            {attended && (
              <p className="badge-row" data-testid="souvenir-badge">
                <span className="badge">Was there</span>
                <span className="muted">Souvenir badge · checked in on-chain. This ticket cannot be resold or reused at the door.</span>
              </p>
            )}
            {returning && (
              <p className="badge-row" data-testid="returning-guest">
                <span className="badge returning">Returning guest</span>
                <span className="muted">This account has a check-in for this event.</span>
              </p>
            )}
            <p className="policy muted">
              Resale cap {formatNear(record.max_resale_price)} N · host royalty {Number(record.royalty_bps) / 100}%
              {record.listing ? ` · listed at ${formatNear(record.listing.price)} N` : " · not listed"}
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
        <h2>Resale and transfer</h2>
        <p className="muted">
          {attended
            ? "This ticket is a souvenir now. It cannot be listed or transferred."
            : accountId
              ? "List at or below the host cap, buy a listed ticket, or transfer it directly."
              : "Connect a testnet wallet to list, buy, or transfer."}
        </p>
        {record?.listing && !attended && (
          <form onSubmit={buy} style={{ marginBottom: 16 }}>
            <p>
              Listed at <b>{formatNear(record.listing.price)} N</b> by{" "}
              <span className="mono">{record.listing.seller}</span>
            </p>
            <button className="primary" type="submit" data-testid="buy-resale" disabled={!accountId || isOwnerConnected}>
              Buy at cap-safe price
            </button>
          </form>
        )}
        {isOwnerConnected && !attended && (
          record?.listing ? (
            <form onSubmit={cancel} style={{ marginBottom: 16 }}>
              <button type="submit" data-testid="cancel-resale">Cancel listing</button>
            </form>
          ) : (
            <form onSubmit={list} style={{ marginBottom: 16 }}>
              <label>List price (NEAR, max {record ? formatNear(record.max_resale_price) : "—"})</label>
              <input
                data-testid="list-price"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                inputMode="decimal"
                placeholder="1"
                required
              />
              <button className="primary" style={{ marginTop: 12 }} type="submit" data-testid="list-resale">
                List for resale
              </button>
            </form>
          )
        )}
        <h3>Direct transfer</h3>
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
          <button className="primary" style={{ marginTop: 12 }} type="submit" data-testid="transfer-btn" disabled={!accountId || attended}>
            Transfer ticket
          </button>
        </form>
        {tx?.hash && (
          <p className="ok" data-testid="transfer-result">
            Transferred. <a href={explorerTx(tx.hash)}>View transaction</a>
          </p>
        )}
      </div>
    </div>
  );
}

function DoorPanel({ accountId, tokenId, setTokenId }) {
  const [claimed, setClaimed] = useState(accountId || "");
  const [record, setRecord] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [returning, setReturning] = useState(false);
  const [checkTx, setCheckTx] = useState(null);
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
      setReturning(false);
      setVerdict({ ok: false, reason: "Ticket not found on chain." });
      return;
    }
    const guestMark = claimed.trim()
      ? Boolean(await hasAttended(claimed.trim(), rec.event_id))
      : false;
    setReturning(guestMark);
    const admitted = await canEnter(tokenId.trim(), claimed.trim());
    let result;
    if (admitted) {
      result = { ok: true, reason: `${claimed} is the on-chain owner and has not checked in yet.` };
    } else if (rec.attended_at && rec.token.owner_id === claimed.trim()) {
      result = { ok: false, reason: "Deny. This ticket was already checked in and is now a souvenir badge." };
    } else {
      result = {
        ok: false,
        reason: `${claimed} is not the owner. Current owner is ${rec.token.owner_id}.`,
      };
    }
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
        <div className="row">
          <div>
            <label>Token ID</label>
            <input
              data-testid="door-token"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              placeholder="ticket-1"
              required
            />
          </div>
          <div>
            <label>Presented account</label>
            <input
              data-testid="door-account"
              value={claimed}
              onChange={(e) => setClaimed(e.target.value)}
              placeholder="guest.testnet"
              required
            />
          </div>
        </div>
        <button className="primary" style={{ marginTop: 12 }} type="submit" data-testid="verify-btn">
          Verify on-chain owner
        </button>
      </form>
      {returning && (
        <p className="badge-row" data-testid="door-returning">
          <span className="badge returning">Returning guest</span>
          <span className="muted">This account has a prior check-in for this event.</span>
        </p>
      )}
      {verdict && (
        <p className={`verdict ${verdict.ok ? "ok" : "err"}`} data-testid="verdict">
          {verdict.ok ? "Admit. " : "Deny. "}
          {verdict.reason}
        </p>
      )}
      {record && (
        <p className="mono">
          {record.event_name} — owner {record.token.owner_id}
          {record.attended_at ? " — souvenir (was there)" : ""}
        </p>
      )}
      {accountId && record && (accountId === record.host_id) && !record.attended_at && verdict?.ok && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const out = await checkIn({ tokenId: tokenId.trim() });
            setCheckTx(out);
            const rec = await ticketRecord(tokenId.trim());
            setRecord(rec);
            setVerdict({ ok: false, reason: "Checked in on-chain. This ticket is now a souvenir badge." });
            if (rec?.event_id && claimed.trim()) {
              setReturning(Boolean(await hasAttended(claimed.trim(), rec.event_id)));
            }
          }}
        >
          <button className="primary" style={{ marginTop: 12 }} type="submit" data-testid="check-in-btn">
            Record on-chain check-in
          </button>
        </form>
      )}
      {checkTx?.hash && (
        <p className="ok">
          Check-in recorded. <a href={explorerTx(checkTx.hash)}>View transaction</a>
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
