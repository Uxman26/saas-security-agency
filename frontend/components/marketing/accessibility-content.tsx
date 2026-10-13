export function AccessibilityContent() {
  return (
    <>
      <p className="lead text-muted-foreground">
        ControlOps aims to make its public website and SaaS application usable by as many people as possible, including
        people who use assistive technologies.
      </p>

      <h2>1. Our approach</h2>
      <p>
        We design marketing and product interfaces with readable typography, keyboard-focusable controls, labelled form
        fields and sufficient colour contrast where practical. Mobile and desktop layouts are supported for core journeys.
      </p>

      <h2>2. Standards</h2>
      <p>
        We work toward the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA for public pages and continuously
        improve in-app screens. Some third-party embeds or complex operational views may not yet meet every criterion.
      </p>

      <h2>3. Known limitations</h2>
      <p>
        Dense scheduling grids, charts and PDF exports can be harder to use with screen readers. We continue to refine
        labels, focus order and alternative text for product imagery on marketing pages.
      </p>

      <h2>4. Feedback and assistance</h2>
      <p>
        If you encounter an accessibility barrier, email{' '}
        <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a> with the page URL, device or browser, and a
        short description of the issue. We will acknowledge your report and work to provide a reasonable alternative or
        fix.
      </p>

      <h2>5. Related information</h2>
      <p>
        See also our <a href="/privacy">Privacy Notice</a>, <a href="/cookies">Cookie Policy</a> and{' '}
        <a href="/contact">Contact</a> page.
      </p>
    </>
  );
}