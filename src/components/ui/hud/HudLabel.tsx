import React from "react";
import cls from "./HudLabel.module.css";

export type HudLabelProps = {
  text: string;
  tone?: "default" | "accent";
  className?: string;
};

export default function HudLabel({ text, tone = "default", className }: HudLabelProps) {
  return (
    <div className={`${cls.root} ${cls[tone]} ${className ?? ""}`.trim()}>{text}</div>
  );
}
