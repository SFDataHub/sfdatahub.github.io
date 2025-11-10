// src/layout/ContentLayout.tsx
import React from "react";
import ContentShell from "../components/ContentShell";

type Props = {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
};

export default function ContentLayout(props: Props) {
  return <ContentShell rounded="rounded-3xl" padded {...props} />;
}
