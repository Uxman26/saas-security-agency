import { type ComponentPropsWithoutRef, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode
  className?: string
}

interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  name: string
  className: string
  background: ReactNode
  Icon: React.ElementType
  description: ReactNode
  href: string
  cta: string
}

const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-[22rem] grid-cols-3 gap-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const BentoCard = ({
  name,
  className,
  background,
  Icon,
  description,
  href,
  cta,
  ...props
}: BentoCardProps) => (
  <div
    key={name}
    className={cn(
      "group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-xl",
      "bg-background [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)]",
      "dark:bg-[#0F172A] transform-gpu dark:[box-shadow:0_-20px_80px_-20px_#ffffff14_inset] dark:[border:1px_solid_rgba(255,255,255,.1)]",
      className
    )}
    {...props}
  >
    <div>{background}</div>
    <div className="relative z-10 p-5 md:p-6">
      <div className="pointer-events-none z-10 flex transform-gpu flex-col gap-1 transition-all duration-300 lg:group-hover:-translate-y-10">
        <Icon className="h-10 w-10 origin-left transform-gpu text-primary transition-all duration-300 ease-in-out group-hover:scale-75" />
        <h3 className="text-xl font-semibold text-foreground">{name}</h3>
        <div className="max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</div>
      </div>

      <div
        className={cn(
          "pointer-events-none flex w-full translate-y-0 transform-gpu flex-row items-center pt-4 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 lg:hidden"
        )}
      >
        <Button variant="link" asChild size="sm" className="pointer-events-auto p-0 text-foreground">
          <Link href={href}>
            {cta}
            <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
      </div>
    </div>

    <div
      className={cn(
        "pointer-events-none absolute bottom-0 z-10 hidden w-full translate-y-10 transform-gpu flex-row items-center p-5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 md:p-6 lg:flex"
      )}
    >
      <Button variant="link" asChild size="sm" className="pointer-events-auto p-0 text-primary">
        <Link href={href}>
          {cta}
          <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
        </Link>
      </Button>
    </div>

    <div className="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:bg-black/[0.02] group-hover:dark:bg-white/[0.03]" />
  </div>
)

export { BentoCard, BentoGrid }
