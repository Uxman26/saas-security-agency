'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  PHONE_COUNTRIES,
  composePhone,
  parseStoredPhone,
  type CountryDial,
} from '@/lib/phone';
import { cn } from '@/lib/utils';

type Props = {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  placeholder?: string;
};

export function PhoneInput({ value = '', onChange, disabled, className, id, placeholder }: Props) {
  const initial = parseStoredPhone(value);
  const [country, setCountry] = useState<CountryDial>(initial.country);
  const [national, setNational] = useState(initial.national);

  useEffect(() => {
    const next = parseStoredPhone(value);
    setCountry(next.country);
    setNational(next.national);
  }, [value]);

  const countryOptions = useMemo(
    () =>
      PHONE_COUNTRIES.map((c) => ({
        value: c.code,
        label: `${c.code} +${c.dial}`,
      })),
    []
  );

  const emit = (c: CountryDial, nat: string) => {
    onChange(composePhone(c.dial, nat, c.dropLeadingZero));
  };

  const onCountryChange = (code: string) => {
    const c = PHONE_COUNTRIES.find((x) => x.code === code) || PHONE_COUNTRIES[0];
    setCountry(c);
    const max = c.nationalLength + (c.dropLeadingZero ? 1 : 0);
    const trimmed = national.replace(/\D/g, '').slice(0, max);
    setNational(trimmed);
    emit(c, trimmed);
  };

  const onNationalChange = (raw: string) => {
    const max = country.nationalLength + (country.dropLeadingZero ? 1 : 0);
    const digits = raw.replace(/\D/g, '').slice(0, max);
    setNational(digits);
    emit(country, digits);
  };

  const exampleHint = country.dropLeadingZero
    ? `0${'7'.padEnd(Math.min(9, country.nationalLength), '0').slice(0, country.nationalLength - 1)}`
    : `${'7'.padEnd(Math.min(10, country.nationalLength), '0')}`;

  return (
    <div className={cn('flex gap-2', className)}>
      <SearchableSelect
        className="w-[148px] shrink-0"
        value={country.code}
        options={countryOptions}
        disabled={disabled}
        searchPlaceholder="Search country…"
        placeholder="Country"
        onChange={onCountryChange}
      />
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        disabled={disabled}
        value={national}
        onChange={(e) => onNationalChange(e.target.value)}
        placeholder={placeholder || `e.g. ${exampleHint}`}
        className="flex-1"
        maxLength={country.nationalLength + (country.dropLeadingZero ? 1 : 0)}
      />
    </div>
  );
}
