export function SecurityContent() {
  return (
    <>
      <p className="lead text-muted-foreground">
        How ControlOps approaches application security, access control and operational safeguards for its UK workforce
        operations platform.
      </p>

      <h2>1. Authentication and access</h2>
      <p>
        Users authenticate to access the Service. Permissions are enforced through role-based access control so staff
        only see modules and records their organisation has granted. Portal users are limited to the sites or shifts
        their role allows.
      </p>

      <h2>2. Tenant isolation</h2>
      <p>
        Customer data is scoped by company. Queries and APIs enforce company boundaries so one tenant cannot read another
        tenant&apos;s operational records.
      </p>

      <h2>3. Transport and session protections</h2>
      <p>
        Production traffic is served over HTTPS. Session tokens are stored in browser local storage for the signed-in
        application session and are not shared across tenants. Sign-out clears the local session.
      </p>

      <h2>4. Operational controls</h2>
      <ul>
        <li>Audit and activity logging for sensitive administrative and platform actions</li>
        <li>Configurable company roles and module permissions</li>
        <li>Support and live-chat tooling limited to authorised platform operators</li>
        <li>Optional analytics on the public website only after cookie consent</li>
      </ul>

      <h2>5. Data handling</h2>
      <p>
        Customer Content is processed to provide the Service as described in the{' '}
        <a href="/privacy">Privacy Notice</a> and, for processor activities, the{' '}
        <a href="/dpa">Data Processing Agreement</a>. Passwords, payment card numbers and auth tokens are not sent to
        analytics tools.
      </p>

      <h2>6. Business evaluation</h2>
      <p>
        Detailed security questionnaires, architecture summaries and sub-processor lists are available to prospective
        business customers on request under appropriate confidentiality arrangements. Contact{' '}
        <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a> or <a href="/contact">Contact</a>.
      </p>
    </>
  );
}
