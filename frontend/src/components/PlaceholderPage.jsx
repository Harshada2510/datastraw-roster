function PlaceholderPage({ title, description, icon: Icon }) {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      <section className="card placeholder-card">
        <span className="placeholder-icon">
          <Icon size={30} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <h3>{title} module</h3>
        <p>This screen is ready for the next integration step.</p>
        <p className="text-muted">
          No data is loaded yet. Connect the matching FastAPI endpoint here
          when this module is implemented.
        </p>
      </section>
    </div>
  )
}

export default PlaceholderPage
