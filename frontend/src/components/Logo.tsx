import logoUrl from "../assets/logo_sfdatahub.png";

type LogoProps = {
  size?: number;           // Kantenlänge in px
  alt?: string;
  className?: string;
  onClick?: () => void;
};

export default function Logo({
  size = 24,
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
      className={className}
      draggable={false}
      onClick={onClick}
    />
  );
}
