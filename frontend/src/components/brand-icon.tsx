import type { ComponentPropsWithoutRef } from "react";

interface BrandIconProps extends Omit<ComponentPropsWithoutRef<"img">, "src" | "alt" | "width" | "height"> {
  size?: number;
}

export function BurolaboIcon({ size = 32, className = "", ...props }: BrandIconProps) {
  return (
    // The adjacent wordmark supplies the accessible name.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src="/icon.svg?v=5"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
    />
  );
}

export default BurolaboIcon;
