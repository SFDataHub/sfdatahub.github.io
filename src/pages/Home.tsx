export default function Home() {
  return (
    <section>
      <h1 style={{ color: 'var(--title)' }}>Welcome to SF Data Hub</h1>
      <p style={{ color: 'var(--text-soft)' }}>
        Choose a category from the sidebar or start with the Toplists.
      </p>
      <a className="btn" href="#/toplists">Go to Toplists</a>
    </section>
  );
}
