import logoUrl from "../assets/logo_sfdatahub.png";

type LogoProps = {
  size?: number;           // Kantenlänge in px
  alt?: string;
  className?: string;
  onClick?: () => void;
};

export default function Logo({
  size = 72,               // OG-Seite rendert ~72px
  alt = "SFDataHub",
  className = "",
  onClick,
}: LogoProps) {
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      className={`select-none ${className}`}
      draggable={false}
      onClick={onClick}
    />
  );
}
