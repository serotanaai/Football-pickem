import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & Privacy — PickemWeekly",
  description:
    "The agreement you sign up to, what data PickemWeekly keeps, the email it sends, and how to stop it.",
};

/**
 * Both agreements on one page.
 *
 * One page rather than two because they are read in one sitting, at signup, by
 * somebody who is trying to get to the football — and because the thing most
 * people actually want from either document is the same thing: what will you
 * send me, and how do I make it stop. That has its own heading and its own
 * anchor so it can be linked to directly from a footer or an email.
 */

const UPDATED = "8 September 2026";
const CONTACT = "support@pickemweekly.com";

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        fontSize: "1.35rem",
        letterSpacing: "-0.02em",
        margin: "3rem 0 0.5rem",
        scrollMarginTop: "1.5rem",
      }}
    >
      {children}
    </h2>
  );
}

function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3
      id={id}
      style={{
        fontSize: "1rem",
        margin: "1.75rem 0 0.4rem",
        scrollMarginTop: "1.5rem",
      }}
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="muted" style={{ margin: "0 0 0.85rem", lineHeight: 1.65 }}>
      {children}
    </p>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul
      className="muted"
      style={{ margin: "0 0 0.85rem", paddingLeft: "1.15rem", lineHeight: 1.65 }}
    >
      {children}
    </ul>
  );
}

export default function LegalPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "3.5rem 1.25rem 5rem" }}>
      <Link href="/" style={{ textDecoration: "none", fontWeight: 750, fontSize: "1.05rem" }}>
        🏈 PickemWeekly
      </Link>

      <h1 style={{ fontSize: "1.9rem", letterSpacing: "-0.03em", margin: "1.75rem 0 0.35rem" }}>
        Terms &amp; Privacy
      </h1>
      <p className="note" style={{ margin: "0 0 1.5rem" }}>
        Last updated {UPDATED} · Version {LEGAL_VERSION}
      </p>

      <div
        className="surface"
        style={{ padding: "1rem 1.15rem", display: "flex", flexWrap: "wrap", gap: "1rem" }}
      >
        <a href="#terms" style={{ color: "var(--accent)" }}>
          Terms of Service
        </a>
        <a href="#privacy" style={{ color: "var(--accent)" }}>
          Privacy &amp; Data Policy
        </a>
        <a href="#email" style={{ color: "var(--accent)" }}>
          Email communication
        </a>
      </div>

      {/* ------------------------------------------------------------------ */}

      <H2 id="terms">Terms of Service</H2>

      <P>
        PickemWeekly is a free website for running weekly college football pick&rsquo;em leagues
        with people you know. By creating an account you agree to what is written here. If you do
        not agree, do not create an account.
      </P>

      <H3>Your account</H3>
      <P>
        You need an account to pick. You must be at least 13 years old, give a working email
        address, and keep your password to yourself. You are responsible for what happens under
        your account, so tell us if you think somebody else is using it. One account per person —
        extra accounts used to enter a league more than once will be removed along with their
        picks.
      </P>

      <H3>Leagues and picks</H3>
      <UL>
        <li>
          Each league has a weekly board. You submit one ticket for the week, and once submitted it
          is final — picks cannot be changed afterwards.
        </li>
        <li>
          You can submit late, but any game that has already kicked off is closed and cannot be
          picked. Those points are simply lost.
        </li>
        <li>
          One game each week is the matchup of the week and is worth extra points. It is chosen
          when the board is built and does not move afterwards.
        </li>
        <li>
          Whoever creates a league sets its scope, size and playoff format, and can rebuild a week
          before anyone has picked it.
        </li>
      </UL>

      <H3>This is not gambling</H3>
      <P>
        PickemWeekly is for entertainment. We do not accept money, hold funds, pay out prizes, or
        take any part in wagering. Whatever you and your friends agree between yourselves is
        yours to sort out and nothing to do with us.
      </P>

      <H3>Fair use</H3>
      <P>
        Do not automate picks, scrape the site, try to reach other people&rsquo;s accounts or data,
        or interfere with how the site runs. Choose a display name your league would be happy to
        read — impersonation, slurs and harassment get an account removed. We can suspend or delete
        an account that breaks these rules, and we do not have to warn you first.
      </P>

      <H3>What we do not promise</H3>
      <P>
        The site is free and provided as is. Scores, schedules, rankings and team information come
        from third-party feeds and can be late, wrong, or missing. We correct what we can when we
        notice it, but we do not guarantee that the site is available, that a result is accurate, or
        that a week scores the way you expected. We are not liable for anything you lose by relying
        on it.
      </P>

      <H3>Ending it</H3>
      <P>
        You can stop using PickemWeekly whenever you like and ask us to delete your account by
        emailing {CONTACT}. We may close accounts or shut the service down; if we shut it down we
        will try to give reasonable notice by email.
      </P>

      <H3>Changes</H3>
      <P>
        We may update these terms. If a change materially affects what you agreed to, we will say so
        by email or on the site before it takes effect. Continuing to use the site after that means
        you accept the new version.
      </P>

      {/* ------------------------------------------------------------------ */}

      <H2 id="privacy">Privacy &amp; Data Policy</H2>

      <P>
        The short version: we keep what the game needs and nothing else, we do not sell it, we do
        not advertise to you, and we do not run analytics or tracking software of any kind.
      </P>

      <H3>What we collect</H3>
      <UL>
        <li>
          <b>Account</b> — your email address, your display name, and a securely hashed password.
          We never see your password in readable form.
        </li>
        <li>
          <b>Gameplay</b> — the leagues you belong to, the picks you submit, when you submitted
          them, and the points and standings that come out of them.
        </li>
        <li>
          <b>Technical</b> — ordinary server logs kept by our hosting provider, including IP
          address and browser type, used to keep the site running and to spot abuse.
        </li>
      </UL>
      <P>
        We do not collect payment details, we do not ask for your real name, date of birth or
        location, and there are no advertising or analytics trackers on the site.
      </P>

      <H3>What it is used for</H3>
      <P>
        Running your leagues, scoring your picks, showing your standings to the other people in
        those leagues, sending you the emails described below, and keeping accounts secure. Nothing
        else.
      </P>

      <H3>Who else can see it</H3>
      <UL>
        <li>
          <b>People in your leagues</b> see your display name, your picks once a game has started,
          your record and your position. They do not see your email address.
        </li>
        <li>
          <b>Supabase</b> — hosts our database and handles sign-in.
        </li>
        <li>
          <b>Vercel</b> — hosts and serves the website.
        </li>
        <li>
          <b>Resend</b> — delivers the emails described below.
        </li>
      </UL>
      <P>
        Those three process data on our instructions in order to provide the service. We do not
        sell or rent your data, and we do not share it for advertising. Game and ranking data comes
        <i> in</i> from public sports feeds; nothing about you goes out to them.
      </P>

      {/* ------------------------------------------------------------------ */}

      <H2 id="email">Email communication</H2>

      <P>
        Because you joined a league, we send a small number of emails tied to that league&rsquo;s
        week. There are four, and that is the entire list:
      </P>

      <UL>
        <li>
          <b>Weekly results</b> — after the last game of your league&rsquo;s week finishes: where
          you placed, who won the week, and the full standings table.
        </li>
        <li>
          <b>Matchup of the week</b> — when the next week&rsquo;s board opens: the game worth extra
          points in that league, with the teams, rankings, venue and kickoff time.
        </li>
        <li>
          <b>Pick reminder</b> — only if you have not submitted that week&rsquo;s ticket yet.
        </li>
        <li>
          <b>Last call</b> — a few hours before the board locks, again only if you still have not
          submitted.
        </li>
      </UL>

      <P>
        You get one set per league you belong to, so being in three leagues means three results
        emails. We do not send marketing, newsletters, partner offers, or anything you did not join
        a league to receive, and we never pass your address to anyone else to email you.
      </P>

      <H3 id="unsubscribe">You can unsubscribe at any time</H3>
      <P>
        Every one of those emails carries an unsubscribe link at the bottom, and they support the
        one-click unsubscribe button your mail app shows next to the sender. Either one stops all
        four kinds immediately — there is no confirmation step, no &ldquo;are you sure&rdquo;, and
        nothing to sign in to.
      </P>
      <P>
        Unsubscribing changes nothing else. Your account stays, your leagues stay, your picks and
        standings stay, and you can sign in and play exactly as before — you just stop hearing from
        us about it. If you change your mind, email {CONTACT} and we will turn it back on.
      </P>
      <P>
        Two things are not covered by that, because they are not marketing: emails needed to run
        your account, such as confirming your address or resetting your password, and rare notices
        about a change to these terms or to the service. Those go to every account holder.
      </P>

      {/* ------------------------------------------------------------------ */}

      <H2 id="keeping">Keeping and deleting your data</H2>
      <P>
        We keep your account and its picks while your account exists, because a league&rsquo;s
        standings are built from them. Ask us to delete your account by emailing {CONTACT} and we
        will remove it, along with your email address and display name, within 30 days. Picks may
        remain in a league&rsquo;s historical standings in a form that is no longer tied to you, so
        that the other members&rsquo; results still add up.
      </P>
      <P>
        You can also ask us what we hold about you, or ask us to correct it, at the same address.
      </P>

      <H3>Cookies</H3>
      <P>
        We set cookies for one purpose: keeping you signed in. There are no advertising cookies, no
        tracking pixels and no third-party cookies on the site.
      </P>

      <H3>Children</H3>
      <P>
        PickemWeekly is not for children under 13. If we learn that an account belongs to someone
        under 13 we will delete it.
      </P>

      <H3>Questions</H3>
      <P>Anything at all: {CONTACT}.</P>

      <p style={{ margin: "3rem 0 0" }}>
        <Link className="btn" href="/">
          Back to PickemWeekly
        </Link>
      </p>
    </div>
  );
}
