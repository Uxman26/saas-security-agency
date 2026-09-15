export function CookiePolicyContent() {
  return (
    <>
      <p className="lead text-muted-foreground">
        This Cookie Policy explains how ControlOps uses cookies and similar technologies on{' '}
        <a href="https://controlops.co.uk">https://controlops.co.uk</a> and related Service pages. It should be read
        with our <a href="/privacy">Privacy Notice</a>.
      </p>

      <h2>1. What cookies are</h2>
      <p>
        Cookies are small text files stored on your device. Similar technologies include local storage and session
        storage, which websites and apps can use to remember preferences or keep you signed in.
      </p>

      <h2>2. How we use cookies and similar technologies</h2>
      <p>Based on how ControlOps is built today, we use:</p>
      <div className="not-prose overflow-x-auto my-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-semibold">Name / type</th>
              <th className="py-2 pr-3 font-semibold">Purpose</th>
              <th className="py-2 font-semibold">Duration / storage</th>
            </tr>
          </thead>
          <tbody className="align-top text-muted-foreground">
            <tr className="border-b">
              <td className="py-3 pr-3 text-foreground">locale</td>
              <td className="py-3 pr-3">Stores your language preference (for example English or Arabic)</td>
              <td className="py-3">Cookie, up to 1 year</td>
            </tr>
            <tr className="border-b">
              <td className="py-3 pr-3 text-foreground">Authentication token</td>
              <td className="py-3 pr-3">Keeps Authorised Users signed in to the Service after login</td>
              <td className="py-3">Browser local storage (not a first-party cookie)</td>
            </tr>
            <tr>
              <td className="py-3 pr-3 text-foreground">Theme preference</td>
              <td className="py-3 pr-3">Remembers light / dark / system appearance where the theme control is shown</td>
              <td className="py-3">Browser local storage (via theme tooling)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        These technologies are used for essential operation and preferences. We do not currently operate a separate
        advertising cookie programme on the public website. If we introduce analytics or marketing cookies later, we will
        update this policy and, where required, seek consent.
      </p>
      <p>
        Third-party services you choose to use (for example Google, Microsoft or Apple sign-in, or Stripe Checkout) may
        set their own cookies or similar technologies under their policies when you interact with them.
      </p>

      <h2>3. Managing cookies</h2>
      <p>
        You can control cookies through your browser settings. Blocking essential cookies or clearing local storage may
        prevent language preference or sign-in from working correctly.
      </p>

      <h2>4. Contact</h2>
      <p>
        Questions: <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a>
      </p>
    </>
  );
}
