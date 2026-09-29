import { cn } from "@/lib/cn"
import { Loader2Icon } from "lucide-react"

// Decorative by default: it sits next to text ("Saving…", a button label) that already says what is
// happening, and a role="status" here would add a second live region per button. Pass role/aria-label
// to use it standalone.
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon data-slot="spinner" aria-hidden className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
