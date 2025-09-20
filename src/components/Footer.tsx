import React from "react";
import { Github, Scale, ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-left">
        <span className="muted">© 2025 SF Data Hub</span>
        <span className="dot">•</span>
        <a href="#/imprint" className="muted">Imprint</a>
        <span className="dot">•</span>
        <a href="#/privacy" className="muted">Privacy</a>
        <span className="dot">•</span>
        <a href="#/license" className="muted">License</a>
      </div>

      <div className="footer-right">
        <a className="pill" href="https://github.com/SFDataHub" target="_blank" rel="noreferrer">
          <Github className="ico" /> GitHub
        </a>
        <a className="pill" href="#/status">
          <ShieldCheck className="ico" /> Status
        </a>
        <span className="version muted">
          v0.1.0
        </span>
      </div>
    </footer>
  );
}
