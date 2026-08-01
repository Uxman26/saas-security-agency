import * as React from "react"

import { TEXT_LIMITS } from "@/lib/text-limits"
import { cn } from "@/lib/utils"

/**
 * Input types where a character cap means something. Numbers, dates, checkboxes
 * and files ignore maxLength, so they are deliberately absent.
 */
const DEFAULT_MAX_LENGTH: Record<string, number> = {
  text: TEXT_LIMITS.text,
  search: TEXT_LIMITS.text,
  password: TEXT_LIMITS.text,
  email: TEXT_LIMITS.email,
  tel: TEXT_LIMITS.phone,
  url: TEXT_LIMITS.url,
}

function Input({ className, type, maxLength, ...props }: React.ComponentProps<"input">) {
  // Free-text fields are capped by default so none is left unbounded by omission.
  // Pass an explicit maxLength (see TEXT_LIMITS) when a field needs a tighter cap.
  const limit = maxLength ?? DEFAULT_MAX_LENGTH[type ?? "text"]

  return (
    <input
      type={type}
      maxLength={limit}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
