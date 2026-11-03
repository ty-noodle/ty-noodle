import Image from "next/image";

type LineAppIconProps = {
  className?: string;
  strokeWidth?: number;
};

export function LineAppIcon({ className }: LineAppIconProps) {
  return (
    <Image
      src="/icons8-line.svg"
      alt="LINE"
      width={18}
      height={18}
      className={className}
    />
  );
}
