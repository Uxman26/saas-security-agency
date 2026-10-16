/** Pure eligibility helper mirroring PricingGrid trial CTA rules. */
function showTrialForTier(opts: {
  enabled: boolean;
  trialDays: number | null;
  tier: string;
  eligibleTiers?: string[];
  onUpgrade?: boolean;
}) {
  const eligible = (opts.eligibleTiers || []).map((t) => t.toLowerCase());
  const tierEligible =
    eligible.length === 0 || eligible.includes(opts.tier.toLowerCase());
  return Boolean(opts.enabled && opts.trialDays && tierEligible && !opts.onUpgrade);
}

describe('enterprise trial CTA eligibility', () => {
  it('shows trial for enterprise when backend lists it as eligible', () => {
    expect(
      showTrialForTier({
        enabled: true,
        trialDays: 180,
        tier: 'enterprise',
        eligibleTiers: ['basic', 'standard', 'premium', 'enterprise'],
      }),
    ).toBe(true);
  });

  it('shows trial for enterprise when eligibleTiers is empty (all packages)', () => {
    expect(
      showTrialForTier({
        enabled: true,
        trialDays: 180,
        tier: 'enterprise',
        eligibleTiers: [],
      }),
    ).toBe(true);
  });

  it('hides trial for enterprise when not in eligible_tiers', () => {
    expect(
      showTrialForTier({
        enabled: true,
        trialDays: 180,
        tier: 'enterprise',
        eligibleTiers: ['basic', 'standard', 'premium'],
      }),
    ).toBe(false);
  });

  it('does not offer trial on upgrade cards', () => {
    expect(
      showTrialForTier({
        enabled: true,
        trialDays: 180,
        tier: 'enterprise',
        eligibleTiers: ['enterprise'],
        onUpgrade: true,
      }),
    ).toBe(false);
  });

  it('still shows trial for premium', () => {
    expect(
      showTrialForTier({
        enabled: true,
        trialDays: 180,
        tier: 'premium',
        eligibleTiers: ['basic', 'standard', 'premium', 'enterprise'],
      }),
    ).toBe(true);
  });
});
