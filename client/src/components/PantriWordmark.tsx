import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface WordmarkProps {
  className?: string;
  /** Force a specific theme variant; defaults to following the document `.dark` class */
  variant?: "auto" | "light" | "dark";
  /** Use rendered cursive image (true) or text fallback (false) */
  asImage?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE = {
  sm: "h-8",
  md: "h-12",
  lg: "h-16",
  xl: "h-24",
} as const;

const TEXT_SIZE = {
  sm: "text-3xl",
  md: "text-4xl",
  lg: "text-6xl",
  xl: "text-8xl",
} as const;

/**
 * Pantri wordmark. Uses the rendered cursive logo image by default;
 * falls back to Allura cursive text rendering for inline contexts.
 */
export function PantriWordmark({ className, variant = "auto", asImage = true, size = "md" }: WordmarkProps) {
  if (!asImage) {
    return (
      <span
        className={cn(
          "pantri-wordmark inline-block leading-none",
          "text-primary",
          TEXT_SIZE[size],
          className
        )}
        aria-label="Pantri"
      >
        Pantri
      </span>
    );
  }

  const useDark = variant === "dark";
  const useLight = variant === "light";

  if (variant === "auto") {
    return (
      <picture className={cn("inline-block", className)}>
        <source srcSet={BRAND.logoDark} media="(prefers-color-scheme: dark)" />
        <img src={BRAND.logoLight} alt="Pantri" className={cn(SIZE[size], "w-auto select-none")} draggable={false} />
      </picture>
    );
  }
  return (
    <img
      src={useDark ? BRAND.logoDark : useLight ? BRAND.logoLight : BRAND.logoLight}
      alt="Pantri"
      className={cn(SIZE[size], "w-auto select-none", className)}
      draggable={false}
    />
  );
}

/**
 * Compact app icon mark.
 */
export function PantriMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <img
      src={BRAND.icon192}
      alt="Pantri"
      width={size}
      height={size}
      className={cn("rounded-xl shadow-sm select-none", className)}
      draggable={false}
    />
  );
}
