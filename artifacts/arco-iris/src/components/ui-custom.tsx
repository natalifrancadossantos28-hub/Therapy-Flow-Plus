import React from "react";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

export const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("bg-card text-card-foreground rounded-2xl border border-border shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden transition-all duration-300 hover:border-primary/20 hover:shadow-[0_0_28px_rgba(0,240,255,0.06),0_4px_24px_rgba(0,0,0,0.5)]", className)} {...props}>
    {children}
  </div>
);

export const MotionCard = ({ className, children, ...props }: HTMLMotionProps<"div">) => (
  <motion.div 
    className={cn("bg-card text-card-foreground rounded-2xl border border-border shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden", className)} 
    whileHover={{ y: -4, boxShadow: "0 0 30px rgba(0,240,255,0.08), 0 8px 32px rgba(0,0,0,0.5)" }}
    transition={{ duration: 0.2 }}
    {...props}
  >
    {children}
  </motion.div>
);

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" }>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-primary/50 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(0,240,255,0.45),0_0_40px_rgba(0,240,255,0.15)]",
      outline: "bg-transparent border-2 border-primary/60 text-primary hover:bg-primary/8 hover:border-primary hover:shadow-[0_0_16px_rgba(0,240,255,0.4),0_0_30px_rgba(0,240,255,0.12)]",
      ghost: "bg-transparent text-foreground/80 hover:bg-secondary hover:text-foreground border-transparent",
      destructive: "bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/20 hover:shadow-[0_0_16px_rgba(255,30,90,0.4)]",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-secondary/50",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none border",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export const Badge = ({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border", className)} {...props}>
    {children}
  </span>
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground mb-1.5 block", className)} {...props} />
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 appearance-none",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";
