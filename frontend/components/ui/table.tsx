"use client"

import * as React from "react"

import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto touch-pan-x"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm leading-normal", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:hover:bg-transparent", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

/** Clicks on these inside a row keep their own behaviour instead of opening the row. */
const ROW_CLICK_IGNORE =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="checkbox"], [role="menuitem"], [role="switch"], [role="combobox"], [role="option"], [data-row-click-ignore]'

type TableRowProps = React.ComponentProps<"tr"> & {
  /** Opens this page when the row is clicked (Ctrl/Cmd-click opens a new tab). */
  href?: string
  /** Runs when the row itself is clicked (not a button, link or menu inside it). */
  onRowClick?: () => void
}

function TableRow({ className, href, onRowClick, onClick, onKeyDown, ...props }: TableRowProps) {
  const router = useRouter()
  const clickable = Boolean(href || onRowClick)

  const open = (newTab: boolean) => {
    if (href) {
      if (newTab) window.open(href, "_blank", "noopener")
      else router.push(href)
    } else {
      onRowClick?.()
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    onClick?.(e)
    if (!clickable || e.defaultPrevented) return
    const target = e.target as Element
    // React bubbles clicks out of portals (menus, dialogs); only react to clicks really in the row.
    if (!e.currentTarget.contains(target)) return
    if (target.closest(ROW_CLICK_IGNORE)) return
    // Let people select text in a row without opening it.
    if (window.getSelection()?.toString()) return
    open(e.ctrlKey || e.metaKey)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    onKeyDown?.(e)
    if (!clickable || e.defaultPrevented || e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      open(false)
    }
  }

  return (
    <tr
      data-slot="table-row"
      data-clickable={clickable || undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "hover:bg-primary/10 data-[state=selected]:bg-muted border-b transition-colors",
        clickable &&
          "cursor-pointer focus-visible:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-11 px-2.5 text-left align-middle text-sm font-semibold whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-2.5 py-2.5 align-middle text-sm whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
