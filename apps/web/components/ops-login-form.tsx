/**
 * Founder-only ops sign-in. A native form POST to /ops/login exchanges the
 * shared secret for an httpOnly session cookie, then 303-redirects back to
 * `next` (sanitized server-side to a same-origin /ops path). No client JS.
 */
export function OpsLoginForm({ next, error }: { next: string; error?: boolean }) {
  return (
    <form className="lead-form ops-login" method="post" action="/ops/login">
      <input type="hidden" name="next" value={next} />
      <label>
        Founder secret
        <input
          type="password"
          name="secret"
          autoComplete="off"
          autoFocus
          required
        />
      </label>
      {error ? (
        <p className="ops-login-error" role="alert">
          Incorrect secret.
        </p>
      ) : null}
      <button className="btn" type="submit">
        Sign in
      </button>
    </form>
  );
}
