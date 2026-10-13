export function DpaContent() {
  return (
    <>
      <p className="lead text-muted-foreground">
        This page summarises how ControlOps processes personal data as a processor for UK business customers using the
        multi-tenant SaaS Service. The full Data Processing Agreement (DPA) is available on request for contract review.
      </p>

      <h2>1. Roles</h2>
      <p>
        For Customer Content (workforce, rota, operational, payroll preparation and related records you upload or create
        in the Service), the Customer is the controller and ControlOps is the processor. For account, billing, website
        enquiry and security logs relating to Service provision, ControlOps acts as an independent controller as described
        in the <a href="/privacy">Privacy Notice</a>.
      </p>

      <h2>2. Subject matter and duration</h2>
      <p>
        Processing covers hosting, storage, transmission, backup and support access needed to provide the Service for the
        term of the Customer&apos;s subscription and any agreed retention or deletion period after termination.
      </p>

      <h2>3. Nature and purpose</h2>
      <p>
        Processing is limited to providing and securing the ControlOps platform, supporting Authorised Users, and
        complying with applicable law. ControlOps does not sell Customer Content or use it to train unrelated third-party
        models.
      </p>

      <h2>4. Types of personal data and data subjects</h2>
      <p>
        Typical categories include names, contact details, employment and assignment information, site and shift records,
        document metadata, and related operational notes about Customer staff, contractors and client contacts, as
        determined by the Customer.
      </p>

      <h2>5. Instructions and confidentiality</h2>
      <p>
        ControlOps processes Customer Content on documented Customer instructions (including configuration inside the
        Service) and ensures personnel authorised to process it are bound by confidentiality obligations.
      </p>

      <h2>6. Security</h2>
      <p>
        Technical and organisational measures include authenticated access, company-scoped tenant isolation, encryption in
        transit, role-based permissions and operational monitoring. A higher-level summary is available on our{' '}
        <a href="/security">Security</a> page. Detailed security materials can be provided under NDA for procurement.
      </p>

      <h2>7. Sub-processors</h2>
      <p>
        ControlOps may use carefully selected sub-processors (for example hosting, email delivery or payment providers)
        under written terms that provide equivalent data protection obligations. Customers will be informed of material
        changes through the Service or contract notices.
      </p>

      <h2>8. International transfers</h2>
      <p>
        Where personal data is transferred outside the UK, ControlOps uses appropriate safeguards such as UK adequacy
        regulations or standard contractual clauses, as applicable.
      </p>

      <h2>9. Assistance, deletion and audit</h2>
      <p>
        ControlOps will assist Customers with data subject requests, security incidents affecting Customer Content, and
        reasonable audits or information requests as set out in the signed DPA. On termination, Customer Content is
        deleted or returned according to the agreement and product retention settings, except where law requires retention.
      </p>

      <h2>10. Request the full DPA</h2>
      <p>
        Email <a href="mailto:info@controlops.co.uk">info@controlops.co.uk</a> with your organisation name and we will
        provide the current DPA for review. Controller processing for accounts, billing and website enquiries remains
        governed by the <a href="/privacy">Privacy Notice</a>.
      </p>
    </>
  );
}
