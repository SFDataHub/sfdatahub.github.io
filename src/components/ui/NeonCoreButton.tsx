import React from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";

const C = {
  card: "#152A42",
  nav: "#0A1728",
  border: "#2B4C73",
  icon: "#5C8BC6",
  title: "#F5F9FF",
  active: "#1F3B5D",
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Scanline({ active }: { active?: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      initial={false}
      animate={{ opacity: active ? 0.55 : 0.0 }}
      transition={{ duration: 0.2 }}
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.00) 38%, rgba(255,255,255,0.06) 70%, rgba(255,255,255,0.00) 100%)",
      }}
    />
  );
}

function GlowRing({ active }: { active?: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute -inset-1 rounded-2xl"
      initial={false}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: 0.18 }}
      style={{
        boxShadow: `0 0 0 1px ${C.border}, 0 0 24px rgba(92,139,198,0.25)`,
      }}
    />
  );
}

export type NeonCoreButtonProps = {
  open?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  type?: "button" | "submit" | "reset";
};

export function NeonCoreButton({
  open = false,
  onClick,
  disabled,
  label = "Neon core",
  icon = <Flame size={18} color={C.icon} />,
  className,
  title,
  type = "button",
}: NeonCoreButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      type={type}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold",
        "transition-transform duration-150 active:scale-[0.985]",
        disabled && "cursor-not-allowed opacity-60",
        "overflow-hidden px-4",
        className
      )}
      style={{
        background: `linear-gradient(180deg, ${open ? C.active : C.card} 0%, ${C.nav} 160%)`,
        border: `1px solid ${C.border}`,
        color: C.title,
      }}
    >
      <GlowRing active={open} />
      <Scanline active={open} />
      {icon}
      <span>{label}</span>
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={false}
        animate={{ opacity: open ? 0.18 : 0 }}
        style={{
          background:
            "radial-gradient(60% 80% at 50% 10%, rgba(92,139,198,0.45) 0%, rgba(92,139,198,0.00) 60%)",
        }}
      />
    </button>
  );
}

export default NeonCoreButton;
