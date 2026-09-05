import Link from "next/link";
import { ResetRequestForm } from "./ResetRequestForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1.25rem",
      }}
    >
      <div style={{ display: "grid", gap: "1.25rem", justifyItems: "center", width: "100%" }}>
        <Link href="/" style={{ textDecoration: "none", fontWeight: 750, fontSize: "1.15rem" }}>
          🏈 PickemWeekly
        </Link>
        <p className="muted" style={{ margin: 0, textAlign: "center", maxWidth: 380 }}>
          Enter the email on your account and we&apos;ll send you a link to set a new password.
        </p>
        <ResetRequestForm />
      </div>
    </div>
  );
}
