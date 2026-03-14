import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
    {
        variants: {
            variant: {
                default: "border-transparent bg-purple-600 text-white",
                secondary: "border-transparent bg-slate-700 text-white",
                destructive: "border-transparent bg-red-600 text-white",
                outline: "border-purple-500/30 text-purple-400",
                success: "border-transparent bg-green-600/20 text-green-400 border-green-500/30",
            },
        },
        defaultVariants: { variant: "default" },
    }
)

function Badge({ className, variant, ...props }) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
export { Badge }
