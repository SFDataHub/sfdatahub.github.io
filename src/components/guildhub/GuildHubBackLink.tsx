import { Link } from "react-router-dom";
import styles from "./GuildHubBackLink.module.css";

export default function GuildHubBackLink() {
  return (
    <Link to="/guild-hub" className={styles.backLink}>
      Back to Guild Hub
    </Link>
  );
}
