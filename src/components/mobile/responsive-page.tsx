import type { ReactNode } from "react";

type Props = {
  mobile: ReactNode;
  desktop: ReactNode;
};

/** CSS-only responsive split — both trees SSR without hydration flash. */
export function ResponsivePage({ mobile, desktop }: Props) {
  return (
    <>
      <div className="md:hidden">{mobile}</div>
      <div className="hidden md:block">{desktop}</div>
    </>
  );
}
