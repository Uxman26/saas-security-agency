export function PrivacyNoticeContent() {
  return (
    <>
      <p className="lead text-muted-foreground">
        This Privacy Notice explains how ControlOps collects, uses, stores and shares personal data in connection with
        the public website at{' '}
        <a href="https://controlops.co.uk">https://controlops.co.uk</a> and the ControlOps software-as-a-service
        platform (together, the <strong>Service</strong>).
      </p>
      <p>
        It is written for the United Kingdom and is intended to meet transparency requirements under the UK GDPR and the
        Data Protection Act 2018. It is not legal advice. If anything in this notice is unclear, contact us using the
        details below.
      </p>

      <h2>1. Who we are (data controller)</h2>
      <p>
        For personal data we decide how and why to process — including website visitors, demo enquiries, account
        registration details, billing contact information and Service administration — the data controller is the
        organisation that operates ControlOps at controlops.co.uk (referred to as <strong>ControlOps</strong>,{' '}
        <strong>we</strong>, <strong>us</strong> or <strong>our</strong>).
      </p>
      <p>
        <strong>Contact:</strong> <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a>
        <br />
        <strong>Territory:</strong> United Kingdom
      </p>
      <p>
        If you need our full legal entity name, company number or registered office address for a formal request or
        contract, email <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a> and we will provide those
        details.
      </p>
      <p>
        We have not appointed a Data Protection Officer. Privacy questions and data-subject requests should be sent to
        the contact email above.
      </p>

      <h2>2. Our dual role: controller and processor</h2>
      <p>
        ControlOps is a multi-tenant workforce operations platform used by business customers (each a{' '}
        <strong>Customer</strong>). How UK data protection law applies depends on the data:
      </p>
      <ul>
        <li>
          <strong>Controller.</strong> We are the controller for data about website visitors, people who request a demo,
          people who create or administer a ControlOps account, billing and subscription records for the Customer’s
          ControlOps subscription, security and access logs we generate to operate the Service, and related support
          communications with us.
        </li>
        <li>
          <strong>Processor.</strong> When a Customer uses ControlOps to store or process personal data about their
          workforce, clients, contractors, site contacts or other individuals (together,{' '}
          <strong>Customer Content</strong>), the Customer is the controller of that Customer Content and ControlOps
          processes it on the Customer’s instructions to provide the Service. A Data Processing Agreement (DPA) is
          available to business Customers on request via <a href="/dpa">our DPA page</a> or{' '}
          <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a>.
        </li>
      </ul>

      <h2>3. Personal data we collect</h2>
      <p>Depending on how you interact with us, we may process the categories below.</p>

      <h3>3.1 Website and communications</h3>
      <ul>
        <li>Identity and contact data (for example name, work email, phone number, company name)</li>
        <li>
          Enquiry data from the book-a-demo form (industry, approximate workforce size, operational challenge, optional
          current system and preferred demonstration time)
        </li>
        <li>Technical data such as browser type, device information and IP address where collected by our systems or hosting infrastructure for security and operation of the website</li>
        <li>Preference data such as language selection</li>
      </ul>

      <h3>3.2 Accounts and Service access</h3>
      <ul>
        <li>Account credentials and profile data (name, email address, hashed password where local sign-in is used)</li>
        <li>Email verification and password-reset records</li>
        <li>
          Where social sign-in is enabled and you choose it: identifiers and profile information provided by Google,
          Microsoft and/or Apple (such as subject identifier, name and email), used to authenticate and link your
          account
        </li>
        <li>Role, permissions and company association within a Customer tenant</li>
        <li>Session, authentication and security event data (including IP address and related access metadata)</li>
      </ul>

      <h3>3.3 Customer organisation and subscription</h3>
      <ul>
        <li>Company or trading name and related organisation settings you provide</li>
        <li>Subscription plan, billing cycle, payment status and related billing records</li>
        <li>
          Payment-related identifiers and status information processed via our payment provider (we do not store full
          payment card numbers on ControlOps systems; card payments are handled by Stripe where card checkout is used)
        </li>
      </ul>

      <h3>3.4 Customer Content (processed as a processor)</h3>
      <p>
        Customers may upload or generate personal data in the Service. Depending on modules enabled and how the Customer
        configures the platform, this can include workforce and contractor profiles; contact details; documents and
        licence or right-to-work records; site and client contacts; rota and assignment data; attendance and clock
        events; location or GPS-related data where features such as geo-verified clock-in or patrol scanning are used;
        incident and operational records; payroll-preparation and invoicing information; and related files or notes.
      </p>
      <p>
        ControlOps does not decide which Customer Content a Customer collects. Customers are responsible for ensuring
        they have a lawful basis and any required notices or consents for that data.
      </p>

      <h3>3.5 Support and operations</h3>
      <ul>
        <li>Information you include in support or sales emails</li>
        <li>Transactional email delivery logs where email is configured for the Service</li>
      </ul>

      <h2>4. Sources of personal data</h2>
      <ul>
        <li>Directly from you (website forms, signup, account settings, support)</li>
        <li>From authorised users of a Customer account who invite or create users, or who enter Customer Content</li>
        <li>From identity providers if you use Google, Microsoft or Apple sign-in</li>
        <li>From our payment provider in connection with subscription payments</li>
        <li>Automatically from your browser or device when you use the website or Service</li>
      </ul>

      <h2>5. Purposes and lawful bases</h2>
      <p>We process personal data only where UK law allows. The main purposes and bases are:</p>
      <div className="not-prose overflow-x-auto my-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-semibold">Purpose</th>
              <th className="py-2 pr-3 font-semibold">Examples</th>
              <th className="py-2 font-semibold">Lawful basis</th>
            </tr>
          </thead>
          <tbody className="align-top text-muted-foreground">
            <tr className="border-b">
              <td className="py-3 pr-3 text-foreground">Provide and operate the Service</td>
              <td className="py-3 pr-3">Accounts, authentication, tenant features, Customer Content hosting</td>
              <td className="py-3">Contract (Art. 6(1)(b)); for Customer Content as processor, under Customer instructions</td>
            </tr>
            <tr className="border-b">
              <td className="py-3 pr-3 text-foreground">Respond to demo and contact enquiries</td>
              <td className="py-3 pr-3">Book-a-demo submissions; sales follow-up</td>
              <td className="py-3">Legitimate interests (Art. 6(1)(f)) — responding to B2B enquiries and explaining the Service; or steps prior to a contract where applicable</td>
            </tr>
            <tr className="border-b">
              <td className="py-3 pr-3 text-foreground">Billing and subscription management</td>
              <td className="py-3 pr-3">Plans, invoices/receipts, payment status, upgrades, cancellations</td>
              <td className="py-3">Contract; legal obligation where tax or accounting rules require records</td>
            </tr>
            <tr className="border-b">
              <td className="py-3 pr-3 text-foreground">Security and misuse prevention</td>
              <td className="py-3 pr-3">Access controls, session management, login attempt limits, audit logs</td>
              <td className="py-3">Legitimate interests — protecting the Service, Customers and users; legal obligation where applicable</td>
            </tr>
            <tr className="border-b">
              <td className="py-3 pr-3 text-foreground">Service communications</td>
              <td className="py-3 pr-3">Verification, password reset, billing notices, operational alerts you configure</td>
              <td className="py-3">Contract; legitimate interests for essential Service messages</td>
            </tr>
            <tr>
              <td className="py-3 pr-3 text-foreground">Improve and administer our business</td>
              <td className="py-3 pr-3">Understanding how the public site is used at a high level; troubleshooting</td>
              <td className="py-3">Legitimate interests — operating and improving a B2B SaaS business, balanced against your rights</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Legitimate interests.</strong> Where we rely on legitimate interests, we consider the impact on individuals
        and use proportionate measures. You may object to processing based on legitimate interests (see rights below).
      </p>
      <p>
        We do not use personal data to send unsolicited marketing newsletters unless we have an appropriate lawful basis
        and you can opt out. Demo and sales follow-up after you contact us is treated as a response to your enquiry.
      </p>

      <h2>6. Who we share personal data with</h2>
      <p>We do not sell personal data. We may share personal data with:</p>
      <ul>
        <li>
          <strong>Service providers (processors)</strong> who help us host and operate the Service, send transactional
          email, process payments, provide infrastructure, and (where enabled) authenticate users via third-party
          identity providers. Categories include hosting and infrastructure providers; email delivery providers; payment
          processors (including Stripe Payments Europe / Stripe for card and subscription payments where used); and
          identity providers (Google, Microsoft and/or Apple) when you choose social sign-in.
        </li>
        <li>
          <strong>The Customer organisation</strong> that owns the tenant account you belong to (administrators and other
          authorised users may see account and operational data according to permissions).
        </li>
        <li>
          <strong>Professional advisers</strong> (for example lawyers or accountants) under confidentiality where needed.
        </li>
        <li>
          <strong>Authorities</strong> where required by law, or to protect rights, safety or security.
        </li>
        <li>
          A buyer or successor in connection with a business transfer, subject to appropriate safeguards.
        </li>
      </ul>
      <p>
        Specific sub-processor names and locations for Customer Content processing can be confirmed in a Customer DPA or
        on request. We do not list every infrastructure provider here where arrangements may change; we will not invent
        certifications or transfer tools that are not in place.
      </p>

      <h2>7. International transfers</h2>
      <p>
        ControlOps is operated for Customers in the United Kingdom. Some providers we use (for example payment or
        identity providers) may process personal data in countries outside the UK.
      </p>
      <p>
        Where a restricted transfer occurs, we take steps required by UK data protection law. Depending on the provider
        and destination, that may include relying on an adequacy regulation or using appropriate safeguards such as the
        UK International Data Transfer Agreement or the UK Addendum to the EU Standard Contractual Clauses. Details for a
        particular transfer can be provided on request where available from the relevant provider.
      </p>

      <h2>8. Retention</h2>
      <p>
        We keep personal data only for as long as needed for the purposes above, including to provide the Service,
        resolve disputes, enforce agreements and meet legal, tax or accounting requirements. Exact periods depend on the
        record type and legal context. In outline:
      </p>
      <ul>
        <li>
          <strong>Account and subscription data</strong> — for the life of the account/subscription and a further period
          as needed for billing, security and legal obligations, then deleted or anonymised where practicable.
        </li>
        <li>
          <strong>Customer Content</strong> — retained for the Customer while the subscription is active and thereafter
          as required to wind down the Service or as instructed by the Customer / required by law. Customers control
          day-to-day deletion inside the product where the feature allows.
        </li>
        <li>
          <strong>Demo and enquiry emails</strong> — for as long as needed to handle the enquiry and related sales
          follow-up, then deleted or archived according to our ordinary business email practices.
        </li>
        <li>
          <strong>Security and access logs</strong> — for a limited operational period unless needed longer for
          investigations or legal claims.
        </li>
      </ul>
      <p>
        If you need a retention schedule for a specific category for due diligence, contact{' '}
        <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a>.
      </p>

      <h2>9. Security</h2>
      <p>
        We use technical and organisational measures appropriate to the nature of the Service, including authenticated
        access, company-scoped (tenant) data separation, password hashing for local credentials, session controls, and
        role-based permissions within Customer accounts. No method of transmission or storage is completely secure; we
        work to protect personal data but cannot guarantee absolute security.
      </p>
      <p>
        Further information for business evaluation is summarised on our <a href="/security">Security</a> page, or
        available on request.
      </p>

      <h2>10. Your rights</h2>
      <p>Under UK data protection law, you may have the right to:</p>
      <ul>
        <li>Access your personal data</li>
        <li>Rectify inaccurate personal data</li>
        <li>Erase personal data in certain circumstances</li>
        <li>Restrict processing in certain circumstances</li>
        <li>Object to processing based on legitimate interests</li>
        <li>Data portability for certain data you provided to us, where processing is automated and based on contract or consent</li>
        <li>Withdraw consent where processing is based on consent (withdrawal does not affect prior lawful processing)</li>
        <li>Complain to the Information Commissioner’s Office (ICO)</li>
      </ul>
      <p>
        To exercise rights in respect of data for which ControlOps is the controller, email{' '}
        <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a> with enough detail for us to verify your identity
        and locate the data. We will respond within the timeframes required by UK law.
      </p>
      <p>
        For Customer Content held in a Customer tenant (for example a guard profile entered by your employer), please
        contact that organisation first. We will assist Customers with requests as required under our processor
        obligations and any applicable DPA.
      </p>

      <h2>11. Automated decision-making and profiling</h2>
      <p>
        We do not use personal data to make solely automated decisions that produce legal or similarly significant
        effects about you. Security features such as temporary lockouts after repeated failed sign-in attempts are
        protective controls, not profiling for marketing or eligibility scoring.
      </p>

      <h2>12. Cookies and similar technologies</h2>
      <p>
        We use cookies and similar technologies as described in our <a href="/cookies">Cookie Policy</a>. Essential
        cookies support language preference and operation of the site. Session credentials for the signed-in Service are
        typically stored in browser local storage rather than as a cookie. Theme preference may be stored locally in your
        browser.
      </p>

      <h2>13. Children</h2>
      <p>
        The Service is a business workforce-operations product and is not directed at children. We do not knowingly
        collect personal data from children for the purpose of offering the Service to them. If you believe a child has
        provided personal data to us inappropriately, contact us and we will take appropriate steps.
      </p>

      <h2>14. Marketing communications</h2>
      <p>
        If you submit a demo or contact enquiry, we may use your details to respond and discuss ControlOps with you.
        You can ask us to stop further sales follow-up at any time by emailing{' '}
        <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a>. Transactional messages needed to operate your
        account (for example verification, password reset or billing notices) are separate from optional marketing.
      </p>

      <h2>15. Complaints</h2>
      <p>
        Please contact us first so we can try to resolve your concern. You also have the right to complain to the UK
        Information Commissioner’s Office:
      </p>
      <p>
        Information Commissioner’s Office
        <br />
        Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF
        <br />
        <a href="https://ico.org.uk" rel="noopener noreferrer" target="_blank">
          https://ico.org.uk
        </a>
        <br />
        Helpline: 0303 123 1113
      </p>

      <h2>16. Changes to this notice</h2>
      <p>
        We may update this Privacy Notice from time to time. The effective date and version appear at the top of this
        page. Material changes may also be notified through the Service or by email where appropriate. Continued use of
        the website or Service after an update constitutes notice of the revised terms of this notice for website and
        controller processing; Customer contracts and DPAs continue to apply as agreed.
      </p>

      <h2>17. Contact</h2>
      <p>
        Privacy questions and data-subject requests:{' '}
        <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a>
        <br />
        General contact: <a href="/contact">Contact</a> · <a href="/book-demo">Book a demo</a>
      </p>
    </>
  );
}
